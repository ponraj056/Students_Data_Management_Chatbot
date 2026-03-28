const { sendTextMessage } = require('../whatsapp/sender');
const { getDeptModels }   = require('../models/deptModels');
const logger = require('../utils/logger');

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseDate(str) {
  if (!str) return null;
  const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  str = String(str).trim();
  const mDMY = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (mDMY) {
    const yr = parseInt(mDMY[3]) < 100 ? 2000 + parseInt(mDMY[3]) : parseInt(mDMY[3]);
    return new Date(yr, parseInt(mDMY[2]) - 1, parseInt(mDMY[1]));
  }
  const m1 = str.match(/^([a-zA-Z]{3})[-\/](\d{1,2})$/);
  if (m1) {
    const mon = months[m1[1].toLowerCase()];
    if (mon === undefined) return null;
    return new Date(2026, mon, parseInt(m1[2]));
  }
  const m2 = str.match(/^(\d{1,2})[-\/]([a-zA-Z]{3})$/);
  if (m2) {
    const mon = months[m2[2].toLowerCase()];
    if (mon === undefined) return null;
    return new Date(2026, mon, parseInt(m2[1]));
  }
  return null;
}

function buildDateStringsInRange(fromDate, toDate) {
  const dates = [];
  const cur = new Date(fromDate);
  while (cur <= toDate) {
    const dd  = String(cur.getDate()).padStart(2, '0');
    const mon = MONTH_NAMES[cur.getMonth()];
    dates.push(dd + '-' + mon);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function parseAttendanceQuery(query) {
  const q = query.trim();
  const rangeMatch =
    q.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})\s+to\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i) ||
    q.match(/([a-zA-Z]{3}[-\/]\d{1,2})\s+to\s+([a-zA-Z]{3}[-\/]\d{1,2})/i) ||
    q.match(/(\d{1,2}[-\/][a-zA-Z]{3})\s+to\s+(\d{1,2}[-\/][a-zA-Z]{3})/i);

  const fromDate = rangeMatch ? parseDate(rangeMatch[1]) : null;
  const toDate   = rangeMatch ? parseDate(rangeMatch[2]) : null;

  let nameStr = q
    .replace(/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/g, '')
    .replace(/[a-zA-Z]{3}[-\/]\d{1,2}/gi, '')
    .replace(/\d{1,2}[-\/][a-zA-Z]{3}/gi, '')
    .replace(/\bto\b/gi, '')
    .replace(/\battendance\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { nameStr, fromDate, toDate };
}

// Smart match: strip spaces & dots
// "kaviyarasu v" -> "KAVIYARASUV" matches "KAVIYARAS U V" -> "KAVIYARASUV"
function nameMatches(queryName, dbName) {
  const compact = s => s.toUpperCase().replace(/[\s\.]/g, '');
  const q = compact(queryName);
  const d = compact(dbName);
  return d === q || d.startsWith(q) || d.includes(q);
}

// After finding matched records, pick only ONE empCode group
// (the most common empCode = the correct student, not a same-name student from diff year)
function deduplicateByEmpCode(records) {
  if (records.length === 0) return records;

  // Group by empCode
  const empGroups = {};
  for (const r of records) {
    const key = r.empCode || 'unknown';
    if (!empGroups[key]) empGroups[key] = [];
    empGroups[key].push(r);
  }

  // Pick the empCode group with the most records (most days uploaded)
  let bestKey = null;
  let bestCount = 0;
  for (const [key, recs] of Object.entries(empGroups)) {
    if (recs.length > bestCount) {
      bestCount = recs.length;
      bestKey   = key;
    }
  }

  return empGroups[bestKey] || records;
}

async function findStudentRecords(depts, nameStr, dateStrings) {
  for (const d of depts) {
    const { Attendance } = getDeptModels(d);
    const candidates = await Attendance.find({ date: { $in: dateStrings } }).lean();
    const matched    = candidates.filter(r => nameMatches(nameStr, r.name || ''));

    if (matched.length > 0) {
      // Deduplicate — pick only one student (one empCode) in case of same name across years
      const deduped = deduplicateByEmpCode(matched);
      return { records: deduped, foundName: deduped[0].name, dept: d };
    }
  }
  return { records: [], foundName: nameStr, dept: null };
}

async function findStudentAnyDate(depts, nameStr) {
  for (const d of depts) {
    const { Attendance } = getDeptModels(d);
    const allNames = await Attendance.distinct('name');
    const matched  = allNames.filter(n => nameMatches(nameStr, n || ''));
    if (matched.length > 0) {
      return { found: true, foundName: matched[0] };
    }
  }
  return { found: false, foundName: nameStr };
}

async function handleAttendance(from, query, user) {
  try {
    const dept  = (user.role === 'ADMIN' || user.role === 'PRINCIPAL') ? null : user.department;
    const depts = dept
      ? [dept]
      : ['AIDS','AIML','BIOMED','BIOTECH','CSBS','CSE','CIVIL','CHEMICAL','CCE','ECE','EEE','IT','MECH','ME','MCA','MBA'];

    const { nameStr, fromDate, toDate } = parseAttendanceQuery(query);
    logger.info('Attendance query -> name="' + nameStr + '" from=' + fromDate + ' to=' + toDate);

    // Case 1: Student date range query
    if (fromDate && toDate && nameStr.length > 1) {
      const dateStrings = buildDateStringsInRange(fromDate, toDate);
      logger.info('Dates: ' + dateStrings.join(', '));

      const { records, foundName } = await findStudentRecords(depts, nameStr, dateStrings);

      if (records.length === 0) {
        const { found, foundName: fn } = await findStudentAnyDate(depts, nameStr);
        if (found) {
          await sendTextMessage(from,
            'No records for *' + fn + '*\n' +
            'in range ' + dateStrings[0] + ' to ' + dateStrings[dateStrings.length - 1] + '\n\n' +
            'Upload attendance files for this period first.'
          );
        } else {
          await sendTextMessage(from,
            'Student "' + nameStr + '" not found.\n\n' +
            'Try exact name. Examples:\n' +
            'ponraj d mar-1 to mar-10\n' +
            'ponraj d 01-03-26 to 10-03-26'
          );
        }
        return;
      }

      const present    = records.filter(r => r.status === 'P').length;
      const absent     = records.filter(r => r.status === 'A').length;
      const leave      = records.filter(r => r.status === 'L').length;
      const total      = records.length;
      const leaveTaken = absent + leave;
      const pct        = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';
      const flag       = parseFloat(pct) < 75 ? 'AT RISK' : 'Good';

      const fromStr = fromDate.toLocaleDateString('en-IN', { day:'2-digit', month:'short' });
      const toStr   = toDate.toLocaleDateString('en-IN',   { day:'2-digit', month:'short' });

      let msg = '*Attendance Report*\n';
      msg += 'Name       : ' + foundName + '\n';
      msg += 'Period     : ' + fromStr + ' to ' + toStr + '\n';
      msg += '----------------------------\n';
      msg += 'Total Days : ' + total + '\n';
      msg += 'Present    : ' + present + '\n';
      msg += 'Leave Taken: ' + leaveTaken + '\n';
      msg += 'Percentage : ' + pct + '% (' + flag + ')\n';
      msg += '----------------------------';

      await sendTextMessage(from, msg);
      return;
    }

    // Case 2: Below X% list
    const belowMatch = query.match(/below\s+(\d+)/i);
    const threshold  = belowMatch ? parseInt(belowMatch[1]) : 75;

    await sendTextMessage(from, 'Calculating attendance... please wait.');

    const results = [];
    for (const d of depts) {
      const { Attendance } = getDeptModels(d);

      // Group by empCode to avoid same-name duplicates
      const allEmpCodes = await Attendance.distinct('empCode');
      for (const empCode of allEmpCodes) {
        if (!empCode) continue;
        const records    = await Attendance.find({ empCode }).lean();
        if (records.length === 0) continue;
        const present    = records.filter(r => r.status === 'P').length;
        const absent     = records.filter(r => r.status === 'A').length;
        const validTotal = present + absent;
        if (validTotal === 0) continue;
        const pct = (present / validTotal * 100).toFixed(1);
        if (parseFloat(pct) < threshold) {
          results.push({ name: records[0].name, empCode, dept: d, pct, total: validTotal });
        }
      }
    }

    if (results.length === 0) {
      await sendTextMessage(from, 'All students above ' + threshold + '% attendance!');
      return;
    }

    results.sort((a, b) => parseFloat(a.pct) - parseFloat(b.pct));

    let msg = '*Students Below ' + threshold + '% Attendance*\n';
    msg += '----------------------------\n';
    results.slice(0, 25).forEach((r, i) => {
      msg += (i + 1) + '. ' + r.name + '\n';
      msg += '   ' + r.dept.toUpperCase() + ' | ' + r.pct + '% (' + r.total + ' days)\n';
    });
    if (results.length > 25) msg += '...and ' + (results.length - 25) + ' more\n';
    msg += '----------------------------\n';
    msg += 'Total: ' + results.length + ' students';

    await sendTextMessage(from, msg);

  } catch (err) {
    logger.error('Attendance error: ' + err.message);
    await sendTextMessage(from, 'Error: ' + err.message);
  }
}

module.exports = { handleAttendance };
