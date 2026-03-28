// src/handlers/resultsHandler.js
// Full Results & Marks Handler

require('dotenv').config();
const { sendTextMessage } = require('../whatsapp/sender');
const { getDeptModels } = require('../models/deptModels');
const Student = require('../models/studentModel');
const logger = require('../utils/logger');

// ─── Get Results model for department ────────────────────────────
function getResultsModel(dept) {
  try {
    const models = getDeptModels(dept.toUpperCase());
    return models.Results || models.Result || null;
  } catch (_) { return null; }
}

// ─── Get all dept results models ─────────────────────────────────
async function getAllDeptModels() {
  const depts = ['IT', 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'AIDS', 'AIML',
    'CSBS', 'CCE', 'BIOMED', 'BIOTECH', 'CHEMICAL', 'MBA', 'MCA', 'ME'];
  const models = [];
  for (const dept of depts) {
    try {
     const m = getDeptModels(dept);
const Result = m.Result || m.Results;
if (Result) models.push({ dept, Results: Result });
    } catch (_) {}
  }
  return models;
}

// ─── Main handler ─────────────────────────────────────────────────
async function handleResults(from, text, user) {
  try {
    const t = text.trim().toLowerCase();

    // ── Roll number search ──────────────────────────────────────
    if (/^\d{10,}$/.test(text.trim())) {
      await handleRollNumberSearch(from, text.trim(), user);
      return;
    }

    // ── Topper list ─────────────────────────────────────────────
    if (/topper/i.test(t)) {
      const semMatch = t.match(/sem\w*\s*(\d+)/i) || t.match(/(\d+)/);
      const sem = semMatch ? parseInt(semMatch[1]) : null;
      await handleToppers(from, sem, user);
      return;
    }

    // ── Arrear students ─────────────────────────────────────────
    if (/arrear/i.test(t)) {
      await handleArrears(from, user);
      return;
    }

    // ── Pass/Fail statistics ────────────────────────────────────
    if (/pass|fail|stat/i.test(t)) {
      const semMatch = t.match(/sem\w*\s*(\d+)/i) || t.match(/(\d+)/);
      const sem = semMatch ? parseInt(semMatch[1]) : null;
      await handlePassFailStats(from, sem, user);
      return;
    }

    // ── CGPA ranking ────────────────────────────────────────────
    if (/cgpa|rank/i.test(t)) {
      await handleCGPARanking(from, user);
      return;
    }

    // ── Subject-wise analysis ───────────────────────────────────
    if (/subject|sub|analysis/i.test(t)) {
      const semMatch = t.match(/sem\w*\s*(\d+)/i) || t.match(/(\d+)/);
      const sem = semMatch ? parseInt(semMatch[1]) : null;
      await handleSubjectAnalysis(from, sem, user);
      return;
    }

    // ── Help menu ───────────────────────────────────────────────
    await sendTextMessage(from,
      `📊 *RESULTS COMMANDS*\n\n` +
      `▪ Roll number   : 922523205001\n` +
      `▪ Toppers       : toppers sem 5\n` +
      `▪ Arrears       : arrear students\n` +
      `▪ Pass/Fail     : pass fail statistics sem 5\n` +
      `▪ CGPA Ranking  : cgpa ranking\n` +
      `▪ Subject       : subject analysis sem 5\n\n` +
      `Type any of the above!`
    );

  } catch (err) {
    logger.error('Results handler error:', err);
    await sendTextMessage(from, '❌ Error: ' + err.message);
  }
}

// ─── 1. Roll number search ────────────────────────────────────────
async function handleRollNumberSearch(from, rollNo, user) {
  try {
    const student = await Student.findOne({ registerNumber: rollNo }).lean().select('name department');
    const name = student?.name || rollNo;
    const dept = student?.department || (user.role !== 'ADMIN' ? user.department : null);

    let results = [];
    if (dept) {
      const Results = getResultsModel(dept);
      if (Results) {
        results = await Results.find({ rollNo }).lean().sort({ semester: 1, subject: 1 });
      }
    } else {
      const allModels = await getAllDeptModels();
      for (const { Results } of allModels) {
        const r = await Results.find({ rollNo }).lean();
        if (r.length > 0) { results = r; break; }
      }
    }

    if (results.length === 0) {
      await sendTextMessage(from, `❌ No results found for ${rollNo}`);
      return;
    }

    // Group by semester
    const bySem = {};
    results.forEach(r => {
      const s = r.semester || 'N/A';
      if (!bySem[s]) bySem[s] = [];
      bySem[s].push(r);
    });

    let msg = `📊 *RESULTS: ${name}*\n🔢 Roll No: ${rollNo}\n`;
    if (results[0]?.cgpa) msg += `🎯 CGPA: ${parseFloat(results[0].cgpa).toFixed(2)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n`;

    for (const sem of Object.keys(bySem).sort((a, b) => a - b)) {
      const semResults = bySem[sem];
      const sgpa = semResults[0]?.sgpa ? parseFloat(semResults[0].sgpa).toFixed(2) : 'N/A';
      msg += `\n📚 *Semester ${sem}* | SGPA: ${sgpa}\n`;

      semResults.forEach(r => {
        const status = r.status === 'PASS' ? '✅' : '❌';
        const total = r.total || (r.internal + r.external) || 0;
        msg += `${status} ${r.subject} | I:${r.internal} E:${r.external} T:${total} | ${r.grade}\n`;
      });
    }

    // ── Arrear details ──────────────────────────────────────────
    const arrearSubjects = results.filter(r => r.status === 'FAIL');
    if (arrearSubjects.length > 0) {
      msg += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `⚠️ *ARREAR DETAILS — ${arrearSubjects.length} subject(s)*\n\n`;

      // Group arrears by semester
      const arrearBySem = {};
      arrearSubjects.forEach(r => {
        const s = r.semester || 'N/A';
        if (!arrearBySem[s]) arrearBySem[s] = [];
        arrearBySem[s].push(r);
      });

      for (const sem of Object.keys(arrearBySem).sort((a, b) => a - b)) {
        msg += `📚 Semester ${sem}:\n`;
        arrearBySem[sem].forEach(r => {
          const total = r.total || (r.internal + r.external) || 0;
          msg += `  ❌ ${r.subject} | I:${r.internal} E:${r.external} T:${total} | Grade: ${r.grade}\n`;
        });
        msg += '\n';
      }
    } else {
      msg += `\n✅ *No Arrears — All Clear!*`;
    }

    await sendTextMessage(from, msg);

  } catch (err) {
    logger.error('Roll number search error:', err);
    await sendTextMessage(from, '❌ Error: ' + err.message);
  }
}

// ─── 2. Toppers ───────────────────────────────────────────────────
async function handleToppers(from, sem, user) {
  try {
    await sendTextMessage(from, '⏳ Fetching toppers...');

    const dept = user.role === 'ADMIN' || user.role === 'PRINCIPAL' ? null : user.department;
    let allResults = [];

    if (dept) {
      const Results = getResultsModel(dept);
      if (Results) {
        const filter = sem ? { semester: sem } : {};
        allResults = await Results.find(filter).lean();
      }
    } else {
      const allModels = await getAllDeptModels();
      for (const { dept: d, Results } of allModels) {
        const filter = sem ? { semester: sem } : {};
        const r = await Results.find(filter).lean();
        r.forEach(x => { x._dept = d; });
        allResults = allResults.concat(r);
      }
    }

    if (allResults.length === 0) {
      await sendTextMessage(from, `❌ No results found${sem ? ' for Semester ' + sem : ''}`);
      return;
    }

    const byRoll = {};
    allResults.forEach(r => {
      if (!byRoll[r.rollNo]) byRoll[r.rollNo] = { rollNo: r.rollNo, dept: r._dept, sgpa: 0, cgpa: 0 };
      if (r.sgpa && sem) byRoll[r.rollNo].sgpa = Math.max(byRoll[r.rollNo].sgpa, parseFloat(r.sgpa) || 0);
      if (r.cgpa)        byRoll[r.rollNo].cgpa = Math.max(byRoll[r.rollNo].cgpa, parseFloat(r.cgpa) || 0);
    });

    const sorted = Object.values(byRoll)
      .sort((a, b) => sem ? b.sgpa - a.sgpa : b.cgpa - a.cgpa)
      .slice(0, 10);

    const rollNos = sorted.map(s => s.rollNo);
    const students = await Student.find({ registerNumber: { $in: rollNos } }).lean().select('name registerNumber department');
    const nameMap = {};
    students.forEach(s => { nameMap[s.registerNumber] = s.name; });

    const label = sem ? `Semester ${sem}` : 'Overall';
    let msg = `🏆 *TOP 10 TOPPERS — ${label}*\n`;
    if (dept) msg += `🏫 Dept: ${dept}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    sorted.forEach((s, i) => {
      const name = nameMap[s.rollNo] || s.rollNo;
      const score = sem ? `SGPA: ${s.sgpa.toFixed(2)}` : `CGPA: ${s.cgpa.toFixed(2)}`;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      msg += `${medal} *${name}*\n   ${s.rollNo} | ${score}\n`;
      if (s.dept) msg += `   Dept: ${s.dept}\n`;
      msg += '\n';
    });

    await sendTextMessage(from, msg);

  } catch (err) {
    logger.error('Toppers error:', err);
    await sendTextMessage(from, '❌ Error: ' + err.message);
  }
}

// ─── 3. Arrear students ───────────────────────────────────────────
async function handleArrears(from, user) {
  try {
    await sendTextMessage(from, '⏳ Fetching arrear students...');

    const dept = user.role === 'ADMIN' || user.role === 'PRINCIPAL' ? null : user.department;

    // rollNo -> { count, subjects: [{subject, semester, grade}] }
    const arrearMap = new Map();

    if (dept) {
      const Results = getResultsModel(dept);
      if (Results) {
        const failed = await Results.find({ status: 'FAIL' }).lean();
        failed.forEach(r => {
          if (!arrearMap.has(r.rollNo)) arrearMap.set(r.rollNo, { count: 0, subjects: [] });
          const entry = arrearMap.get(r.rollNo);
          entry.count++;
          entry.subjects.push({ subject: r.subject, semester: r.semester, grade: r.grade });
        });
      }
    } else {
      const allModels = await getAllDeptModels();
      for (const { Results } of allModels) {
        const failed = await Results.find({ status: 'FAIL' }).lean();
        failed.forEach(r => {
          if (!arrearMap.has(r.rollNo)) arrearMap.set(r.rollNo, { count: 0, subjects: [] });
          const entry = arrearMap.get(r.rollNo);
          entry.count++;
          entry.subjects.push({ subject: r.subject, semester: r.semester, grade: r.grade });
        });
      }
    }

    if (arrearMap.size === 0) {
      await sendTextMessage(from, '✅ No arrear students found!');
      return;
    }

    const rollNos  = Array.from(arrearMap.keys());
    const students = await Student.find({ registerNumber: { $in: rollNos } }).lean()
      .select('name registerNumber department yearOfStudy');
    const studentMap = {};
    students.forEach(s => { studentMap[s.registerNumber] = s; });

    // Sort by arrear count descending
    const sorted = Array.from(arrearMap.entries())
      .sort((a, b) => b[0].count - a[0].count);

    // ── Send header message ───────────────────────────────────
    let header = `⚠️ *ARREAR STUDENTS*\n`;
    header += `Total: *${sorted.length} students*\n`;
    if (dept) header += `Dept: ${dept}\n`;
    header += `━━━━━━━━━━━━━━━━━━━━━━━`;
    await sendTextMessage(from, header);

    // ── Send in chunks of 20 to avoid WhatsApp 4096 char limit ─
    const CHUNK = 20;
    for (let start = 0; start < sorted.length; start += CHUNK) {
      const chunk = sorted.slice(start, start + CHUNK);
      const end   = Math.min(start + CHUNK, sorted.length);

      let msg = `📋 *Students ${start + 1}–${end} of ${sorted.length}*\n\n`;

      chunk.forEach(([rollNo, data], i) => {
        const s    = studentMap[rollNo];
        const name = s?.name || rollNo;
        const yr   = s?.yearOfStudy ? `Yr${s.yearOfStudy}` : '';
        const d    = s?.department || '';

        msg += `${start + i + 1}. *${name}*\n`;
        msg += `   ${rollNo} | ${d} ${yr}\n`;
        msg += `   Total Arrears: *${data.count}*\n`;

        // Group subjects by semester
        const bySem = {};
        data.subjects.forEach(sub => {
          const sem = sub.semester || 'N/A';
          if (!bySem[sem]) bySem[sem] = [];
          bySem[sem].push(sub);
        });

        for (const sem of Object.keys(bySem).sort((a, b) => a - b)) {
          msg += `   📚 Sem ${sem}: `;
          msg += bySem[sem].map(sub => `${sub.subject}(${sub.grade})`).join(', ') + '\n';
        }
        msg += '\n';
      });

      await sendTextMessage(from, msg);

      // Small delay between chunks to avoid rate limiting
      if (start + CHUNK < sorted.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    await sendTextMessage(from, `✅ All *${sorted.length}* arrear students shown above.`);

  } catch (err) {
    logger.error('Arrears error:', err);
    await sendTextMessage(from, '❌ Error: ' + err.message);
  }
}

// ─── 4. Pass/Fail Statistics ──────────────────────────────────────
async function handlePassFailStats(from, sem, user) {
  try {
    await sendTextMessage(from, '⏳ Calculating statistics...');

    const dept = user.role === 'ADMIN' || user.role === 'PRINCIPAL' ? null : user.department;
    let allResults = [];

    if (dept) {
      const Results = getResultsModel(dept);
      if (Results) {
        const filter = sem ? { semester: sem } : {};
        allResults = await Results.find(filter).lean();
      }
    } else {
      const allModels = await getAllDeptModels();
      for (const { dept: d, Results } of allModels) {
        const filter = sem ? { semester: sem } : {};
        const r = await Results.find(filter).lean();
        r.forEach(x => { x._dept = d; });
        allResults = allResults.concat(r);
      }
    }

    if (allResults.length === 0) {
      await sendTextMessage(from, `❌ No results found${sem ? ' for Semester ' + sem : ''}`);
      return;
    }

    const total       = allResults.length;
    const passed      = allResults.filter(r => r.status === 'PASS').length;
    const failed      = allResults.filter(r => r.status === 'FAIL').length;
    const passPercent = ((passed / total) * 100).toFixed(1);

    const grades = {};
    allResults.forEach(r => {
      const g = r.grade || 'N/A';
      grades[g] = (grades[g] || 0) + 1;
    });

    const cgpaValues = allResults.filter(r => r.cgpa).map(r => parseFloat(r.cgpa));
    const avgCGPA = cgpaValues.length > 0
      ? (cgpaValues.reduce((a, b) => a + b, 0) / cgpaValues.length).toFixed(2)
      : 'N/A';

    const label = sem ? `Semester ${sem}` : 'All Semesters';
    let msg = `📊 *PASS/FAIL STATISTICS*\n📚 ${label}\n`;
    if (dept) msg += `🏫 Dept: ${dept}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📋 Total Records : ${total}\n`;
    msg += `✅ Passed        : ${passed} (${passPercent}%)\n`;
    msg += `❌ Failed        : ${failed} (${(100 - parseFloat(passPercent)).toFixed(1)}%)\n`;
    msg += `🎯 Avg CGPA      : ${avgCGPA}\n\n`;
    msg += `📈 *Grade Distribution:*\n`;

    const gradeOrder = ['O', 'A+', 'A', 'B+', 'B', 'C', 'U', 'N/A'];
    gradeOrder.forEach(g => {
      if (grades[g]) {
        const pct = ((grades[g] / total) * 100).toFixed(1);
        const bar = '█'.repeat(Math.round(pct / 5));
        msg += `${g.padEnd(3)} : ${bar} ${grades[g]} (${pct}%)\n`;
      }
    });
    Object.keys(grades).forEach(g => {
      if (!gradeOrder.includes(g)) msg += `${g.padEnd(3)} : ${grades[g]}\n`;
    });

    await sendTextMessage(from, msg);

  } catch (err) {
    logger.error('Pass/fail stats error:', err);
    await sendTextMessage(from, '❌ Error: ' + err.message);
  }
}

// ─── 5. CGPA Ranking ─────────────────────────────────────────────
async function handleCGPARanking(from, user) {
  try {
    await sendTextMessage(from, '⏳ Calculating CGPA ranking...');

    const dept = user.role === 'ADMIN' || user.role === 'PRINCIPAL' ? null : user.department;
    let allResults = [];

    if (dept) {
      const Results = getResultsModel(dept);
      if (Results) allResults = await Results.find({ cgpa: { $gt: 0 } }).lean();
    } else {
      const allModels = await getAllDeptModels();
      for (const { Results } of allModels) {
        const r = await Results.find({ cgpa: { $gt: 0 } }).lean();
        allResults = allResults.concat(r);
      }
    }

    const cgpaMap = {};
    allResults.forEach(r => {
      const cgpa = parseFloat(r.cgpa) || 0;
      if (!cgpaMap[r.rollNo] || cgpa > cgpaMap[r.rollNo]) cgpaMap[r.rollNo] = cgpa;
    });

    const sorted = Object.entries(cgpaMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    if (sorted.length === 0) {
      await sendTextMessage(from, '❌ No CGPA data found');
      return;
    }

    const rollNos  = sorted.map(([r]) => r);
    const students = await Student.find({ registerNumber: { $in: rollNos } }).lean().select('name registerNumber department');
    const nameMap  = {};
    students.forEach(s => { nameMap[s.registerNumber] = s; });

    let msg = `🏅 *CGPA RANKING*\n`;
    if (dept) msg += `🏫 Dept: ${dept}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    sorted.forEach(([rollNo, cgpa], i) => {
      const s     = nameMap[rollNo];
      const name  = s?.name || rollNo;
      const d     = s?.department || '';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      msg += `${medal} *${name}*\n   CGPA: ${cgpa.toFixed(2)} | ${d}\n\n`;
    });

    await sendTextMessage(from, msg);

  } catch (err) {
    logger.error('CGPA ranking error:', err);
    await sendTextMessage(from, '❌ Error: ' + err.message);
  }
}

// ─── 6. Subject-wise Analysis ─────────────────────────────────────
async function handleSubjectAnalysis(from, sem, user) {
  try {
    await sendTextMessage(from, '⏳ Analyzing subjects...');

    const dept = user.role === 'ADMIN' || user.role === 'PRINCIPAL' ? null : user.department;
    let allResults = [];

    if (dept) {
      const Results = getResultsModel(dept);
      if (Results) {
        const filter = sem ? { semester: sem } : {};
        allResults = await Results.find(filter).lean();
      }
    } else {
      const allModels = await getAllDeptModels();
      for (const { Results } of allModels) {
        const filter = sem ? { semester: sem } : {};
        const r = await Results.find(filter).lean();
        allResults = allResults.concat(r);
      }
    }

    if (allResults.length === 0) {
      await sendTextMessage(from, `❌ No results found${sem ? ' for Semester ' + sem : ''}`);
      return;
    }

    const bySubject = {};
    allResults.forEach(r => {
      const sub = r.subject || 'Unknown';
      if (!bySubject[sub]) bySubject[sub] = { total: 0, passed: 0, failed: 0, totalMarks: 0 };
      bySubject[sub].total++;
      if (r.status === 'PASS') bySubject[sub].passed++;
      else bySubject[sub].failed++;
      bySubject[sub].totalMarks += (r.total || 0);
    });

    const sorted = Object.entries(bySubject)
      .map(([sub, data]) => ({
        sub, ...data,
        passRate: ((data.passed / data.total) * 100).toFixed(1),
        avgMarks: (data.totalMarks / data.total).toFixed(1)
      }))
      .sort((a, b) => parseFloat(a.passRate) - parseFloat(b.passRate));

    const label = sem ? `Semester ${sem}` : 'All Semesters';
    let msg = `📖 *SUBJECT-WISE ANALYSIS*\n📚 ${label}\n`;
    if (dept) msg += `🏫 Dept: ${dept}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `⚠️ *Difficult Subjects:*\n`;
    sorted.slice(0, 5).forEach(s => {
      msg += `❌ ${s.sub}\n   Pass: ${s.passRate}% | Fail: ${s.failed}/${s.total}\n\n`;
    });

    msg += `✅ *Best Subjects:*\n`;
    sorted.slice(-5).reverse().forEach(s => {
      msg += `✅ ${s.sub}\n   Pass: ${s.passRate}% | ${s.passed}/${s.total} passed\n\n`;
    });

    await sendTextMessage(from, msg);

  } catch (err) {
    logger.error('Subject analysis error:', err);
    await sendTextMessage(from, '❌ Error: ' + err.message);
  }
}

module.exports = { handleResults };