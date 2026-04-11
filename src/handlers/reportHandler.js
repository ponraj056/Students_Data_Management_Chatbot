// src/handlers/reportHandler.js
// Full Report Generation — Excel + PDF
// Features: Student, Attendance, Results, Dept-wise, Year-wise, Defaulters

const path        = require('path');
const fs          = require('fs-extra');
const XLSX        = require('xlsx');
const { sendTextMessage, sendDocument } = require('../whatsapp/sender');
const { getDeptModels } = require('../models/deptModels');
const Student     = require('../models/studentModel');
const logger      = require('../utils/logger');

const OUTPUT_DIR  = process.env.OUTPUT_DIR || './outputs';
const COLLEGE     = 'V.S.B ENGINEERING COLLEGE';
const ALL_DEPTS   = ['AIDS','AIML','BIOMED','BIOTECH','CSBS','CSE','CIVIL','CHEMICAL','CCE','ECE','EEE','IT','MECH','ME','MCA','MBA'];

// ─── Main Handler ─────────────────────────────────────────────────
async function handleReport(from, query, user, format = 'excel') {
  try {
    const t    = query.toLowerCase();
    const dept = (user.role === 'ADMIN' || user.role === 'PRINCIPAL') ? null : user.department;

    // ── Detect report type ──────────────────────────────────────
    const isAttend   = /attend/i.test(t);
    const isResult   = /result|mark|exam/i.test(t);
    const isDept     = /dept|department/i.test(t);
    const isDefault  = /default|below|arrear|shortage/i.test(t);
    const yearMatch  = t.match(/(\d)(st|nd|rd|th)?\s*year/);
    const yearFilter = yearMatch ? parseInt(yearMatch[1]) : null;

    await sendTextMessage(from, '⏳ Generating report...');

    if (isDefault) {
      await generateDefaultersReport(from, dept, format);
    } else if (isDept) {
      await generateDeptSummaryReport(from, dept, format);
    } else if (isAttend) {
      await generateAttendanceReport(from, dept, yearFilter, format);
    } else if (isResult) {
      await generateResultsReport(from, dept, yearFilter, format);
    } else {
      await generateStudentReport(from, dept, yearFilter, format);
    }

  } catch (err) {
    logger.error('Report error: ' + err.message);
    await sendTextMessage(from, '❌ Report error: ' + err.message);
  }
}

// ─── Helper: Get depts list ───────────────────────────────────────
function getDepts(dept) {
  return dept ? [dept] : ALL_DEPTS;
}

// ─── Helper: Sort by register/roll number ────────────────────────
function sortByRegNo(rows, field = 'RegisterNumber') {
  return rows.sort((a, b) => {
    const aVal = String(a[field] || a['RollNo'] || a['EmpCode'] || '');
    const bVal = String(b[field] || b['RollNo'] || b['EmpCode'] || '');
    return aVal.localeCompare(bVal);
  });
}

// ─── Helper: Save Excel ───────────────────────────────────────────
async function saveExcel(rows, title, sheetName) {
  await fs.ensureDir(OUTPUT_DIR);
  const filePath  = path.join(OUTPUT_DIR, title.replace(/[^a-z0-9]/gi, '_') + '_' + Date.now() + '.xlsx');
  const wb        = XLSX.utils.book_new();
  const colCount  = Object.keys(rows[0]).length;

  const headerRows = [
    [COLLEGE],
    [title + ' — Generated: ' + new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })],
    [],
    Object.keys(rows[0]),
  ];
  const dataRows = rows.map(r => Object.values(r));
  const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows]);

  // Column widths
  ws['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 20 }));

  // Merge header rows
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
  XLSX.writeFile(wb, filePath);
  return filePath;
}

// ─── Helper: Save PDF ─────────────────────────────────────────────
async function savePDF(rows, title) {
  await fs.ensureDir(OUTPUT_DIR);
  const filePath = path.join(OUTPUT_DIR, title.replace(/[^a-z0-9]/gi, '_') + '_' + Date.now() + '.pdf');

  try {
    const PDFDocument = require('pdfkit-table');
    const headers = Object.keys(rows[0]);
    const isLargeTable = headers.length > 10;
    
    // Use A3 for tables with many columns to prevent squishing and layout breaking
    const doc = new PDFDocument({ margin: 30, size: isLargeTable ? 'A3' : 'A4', layout: 'landscape' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    doc.fontSize(14).font('Helvetica-Bold').text(COLLEGE, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(
      title + ' — ' + new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
      { align: 'center' }
    );
    doc.moveDown(1);

    // Compute dynamic column sizes based on data length to prevent squishing
    const colMaxLens = headers.map(h => h.length);
    rows.forEach(r => {
      headers.forEach((h, i) => {
        const val = String(r[h] ?? '');
        if (val.length > colMaxLens[i]) {
          // Cap at 35 characters so no single column steals all available space
          colMaxLens[i] = Math.min(val.length, 35);
        }
      });
    });

    const totalLen = colMaxLens.reduce((a, b) => a + b, 0);
    const availableWidth = (isLargeTable ? 1190.55 : 841.89) - 60; // Landscape widths minus margins
    const columnsSize = colMaxLens.map(len => (len / totalLen) * availableWidth);

    const tableData = {
      headers: headers,
      rows: rows.map(r => headers.map(h => String(r[h] ?? '')))
    };

    await doc.table(tableData, {
      columnsSize: columnsSize,
      prepareHeader: () => doc.font('Helvetica-Bold').fontSize(isLargeTable ? 7 : 8),
      prepareRow: () => doc.font('Helvetica').fontSize(isLargeTable ? 6 : 7),
    });

    doc.end();
    await new Promise(resolve => stream.on('finish', resolve));
    return filePath;
  } catch (e) {
    logger.warn('pdfkit table error: ' + e.message + ' — falling back to Excel');
    return null;
  }
}

// ─── Helper: Send file ────────────────────────────────────────────
async function sendFile(from, rows, title, sheetName, format) {
  if (!rows.length) {
    await sendTextMessage(from, '❌ No data found!');
    return;
  }

  try {
    if (format === 'pdf') {
      const pdfPath = await savePDF(rows, title);
      if (pdfPath) {
        await sendDocument(from, pdfPath, title + '.pdf');
        await fs.remove(pdfPath);
        return;
      }
      // fallback to excel
    }
    // Excel (default)
    const xlsxPath = await saveExcel(rows, title, sheetName);
    await sendDocument(from, xlsxPath, title + '.xlsx');
    await fs.remove(xlsxPath);
  } catch (err) {
    logger.error('sendFile error: ' + err.message);
    await sendTextMessage(from, '❌ File send failed: ' + err.message);
  }
}

// ─── 1. Student Report ────────────────────────────────────────────
async function generateStudentReport(from, dept, yearFilter, format) {
  const depts = getDepts(dept);
  let rows    = [];

  const filter = { ...(yearFilter ? { yearOfStudy: yearFilter } : {}) };
  if (dept) filter.department = new RegExp(dept, 'i');

  const students = await Student.find(filter).lean();

  students.forEach(s => {
    rows.push({
      RegisterNumber: s.registerNumber || '',
      Name:           s.name || '',
      Department:     s.department || '',
      Year:           s.yearOfStudy || '',
      Section:        s.section || '',
      Batch:          s.batchYear || '',
      Gender:         s.gender || '',
      Mobile:         s.mobileNumber || '',
      Email:          s.email || '',
      BloodGroup:     s.bloodGroup || '',
      Community:      s.community || '',
      Hostel:         s.hostelStudent || '',
      FatherName:     s.fatherName || '',
      FatherMobile:   s.fatherMobile || '',
      CGPA:           s.cgpa || '',
      Arrear:         s.arrear || '',
      Status:         'Active',
    });
  });

  // Sort ascending by register number
  rows = sortByRegNo(rows, 'RegisterNumber');

  const yearLabel = yearFilter ? `Year${yearFilter}_` : '';
  const deptLabel = dept ? `${dept}_` : '';
  const title     = `${COLLEGE} — Student Report ${deptLabel}${yearLabel}`;
  const sheet     = `Students ${yearFilter ? 'Yr' + yearFilter : 'All'}`;

  await sendTextMessage(from,
    `📊 *Student Report*\n` +
    `Dept: ${dept || 'All'} | Year: ${yearFilter || 'All'}\n` +
    `Total: *${rows.length} students*\n` +
    `Generating ${format.toUpperCase()}...`
  );

  await sendFile(from, rows, title, sheet, format);
}

// ─── 2. Attendance Report ─────────────────────────────────────────
async function generateAttendanceReport(from, dept, yearFilter, format) {
  const depts = getDepts(dept);
  let rows    = [];

  for (const d of depts) {
    try {
      const { Attendance } = getDeptModels(d);
      const empCodes = await Attendance.distinct('empCode');

      for (const empCode of empCodes) {
        if (!empCode) continue;
        const records = await Attendance.find({ empCode }).lean();
        if (!records.length) continue;

        const year = records[0]?.yearOfStudy;
        if (yearFilter && year !== yearFilter) continue;

        const present    = records.filter(r => r.status === 'P').length;
        const absent     = records.filter(r => r.status === 'A').length;
        const total      = present + absent;
        if (total === 0) continue;
        const pct        = ((present / total) * 100).toFixed(1);

        rows.push({
          EmpCode:    empCode,
          Name:       records[0]?.name || '',
          Department: d.toUpperCase(),
          Year:       year || '',
          TotalDays:  total,
          Present:    present,
          Absent:     absent,
          Percentage: pct + '%',
          Status:     parseFloat(pct) >= 95 ? 'Good' : parseFloat(pct) >= 75 ? 'Average' : 'AT RISK',
        });
      }
    } catch (_) { continue; }
  }

  // Sort ascending by emp code
  rows = sortByRegNo(rows, 'EmpCode');

  const yearLabel = yearFilter ? `Year${yearFilter}_` : '';
  const deptLabel = dept ? `${dept}_` : '';
  const title     = `${COLLEGE} — Attendance Report ${deptLabel}${yearLabel}`;

  await sendTextMessage(from,
    `📋 *Attendance Report*\n` +
    `Dept: ${dept || 'All'} | Year: ${yearFilter || 'All'}\n` +
    `Total: *${rows.length} students*\n` +
    `AT RISK: *${rows.filter(r => r.Status === 'AT RISK').length}*\n` +
    `Generating ${format.toUpperCase()}...`
  );

  await sendFile(from, rows, title, 'Attendance', format);
}

// ─── 3. Results Report ────────────────────────────────────────────
async function generateResultsReport(from, dept, yearFilter, format) {
  const depts = getDepts(dept);
  let rows    = [];

  for (const d of depts) {
    try {
      const models = getDeptModels(d);
      const Result = models.Result || models.Results;
      if (!Result) continue;

      const records = await Result.find({}).lean();

      // If yearFilter — match by rollNo prefix (22=4th, 23=3rd, 24=2nd, 25=1st)
      const currYY = new Date().getFullYear() % 100;
      records.forEach(r => {
        if (yearFilter) {
          const prefix = r.rollNo ? parseInt(r.rollNo.toString().substring(0, 2)) : null;
          const yr     = prefix ? currYY - prefix + 1 : null;
          if (yr !== yearFilter) return;
        }
        rows.push({
          RollNo:     r.rollNo || '',
          Department: d.toUpperCase(),
          Semester:   r.semester || '',
          Subject:    r.subject || '',
          Grade:      r.grade || '',
          SGPA:       r.sgpa ? parseFloat(r.sgpa).toFixed(2) : '',
          CGPA:       r.cgpa ? parseFloat(r.cgpa).toFixed(2) : '',
          Status:     r.status || '',
          Arrears:    r.arrears || 0,
        });
      });
    } catch (_) { continue; }
  }

  // Sort ascending by roll number
  rows = sortByRegNo(rows, 'RollNo');

  const yearLabel = yearFilter ? `Year${yearFilter}_` : '';
  const deptLabel = dept ? `${dept}_` : '';
  const title     = `${COLLEGE} — Results Report ${deptLabel}${yearLabel}`;

  await sendTextMessage(from,
    `📊 *Results Report*\n` +
    `Dept: ${dept || 'All'} | Year: ${yearFilter || 'All'}\n` +
    `Total Records: *${rows.length}*\n` +
    `Generating ${format.toUpperCase()}...`
  );

  await sendFile(from, rows, title, 'Results', format);
}

// ─── 4. Department Summary Report ────────────────────────────────
async function generateDeptSummaryReport(from, dept, format) {
  const depts = getDepts(dept);
  let rows    = [];

  for (const d of depts) {
    try {
      const models   = getDeptModels(d);
      const Att      = models.Attendance;
      const Result   = models.Result || models.Results;

      // Student count from shared model
      const stuCount = await Student.countDocuments({
        department: new RegExp(d, 'i')
      });

      // Attendance avg
      let attPct = 'N/A';
      if (Att) {
        const empCodes = await Att.distinct('empCode');
        let totalPct   = 0, count = 0;
        for (const emp of empCodes.slice(0, 100)) {
          const recs    = await Att.find({ empCode: emp }).lean();
          const present = recs.filter(r => r.status === 'P').length;
          if (recs.length > 0) { totalPct += (present / recs.length) * 100; count++; }
        }
        if (count > 0) attPct = (totalPct / count).toFixed(1) + '%';
      }

      // Results pass %
      let passPct = 'N/A';
      if (Result) {
        const total  = await Result.countDocuments();
        const passed = await Result.countDocuments({ status: 'PASS' });
        if (total > 0) passPct = ((passed / total) * 100).toFixed(1) + '%';
      }

      rows.push({
        Department:   d.toUpperCase(),
        Students:     stuCount,
        AvgAttendance: attPct,
        ResultPass:   passPct,
      });
    } catch (_) { continue; }
  }

  rows = rows.filter(r => r.Students > 0);

  const title = `${COLLEGE} — Department Summary Report`;

  await sendTextMessage(from,
    `🏫 *Department Summary Report*\n` +
    `Depts: *${rows.length}*\n` +
    `Generating ${format.toUpperCase()}...`
  );

  await sendFile(from, rows, title, 'Dept Summary', format);
}

// ─── 5. Defaulters Report (Attendance + Arrears) ─────────────────
async function generateDefaultersReport(from, dept, format) {
  const depts = getDepts(dept);
  let rows    = [];

  for (const d of depts) {
    try {
      const models = getDeptModels(d);
      const Att    = models.Attendance;
      const Result = models.Result || models.Results;

      const empCodes = Att ? await Att.distinct('empCode') : [];

      for (const empCode of empCodes) {
        if (!empCode) continue;
        const records = await Att.find({ empCode }).lean();
        if (!records.length) continue;

        const present = records.filter(r => r.status === 'P').length;
        const total   = records.length;
        const pct     = ((present / total) * 100).toFixed(1);

        if (parseFloat(pct) >= 95) continue; // Only defaulters

        // Get arrear count
        let arrears = 0;
        if (Result) {
          arrears = await Result.countDocuments({ rollNo: empCode, status: 'FAIL' });
        }

        // Get student name from shared model
        const stu = await Student.findOne({
          registerNumber: empCode
        }).lean().select('name yearOfStudy section');

        rows.push({
          RegisterNumber: empCode,
          Name:           stu?.name || records[0]?.name || '',
          Department:     d.toUpperCase(),
          Year:           stu?.yearOfStudy || records[0]?.yearOfStudy || '',
          Section:        stu?.section || '',
          AttPct:         pct + '%',
          AttStatus:      parseFloat(pct) < 75 ? 'CRITICAL' : 'LOW',
          Arrears:        arrears,
        });
      }
    } catch (_) { continue; }
  }

  // Sort ascending by register number
  rows = sortByRegNo(rows, 'RegisterNumber');

  const deptLabel = dept ? `${dept}_` : '';
  const title     = `${COLLEGE} — Defaulters Report ${deptLabel}`;

  await sendTextMessage(from,
    `⚠️ *Defaulters Report*\n` +
    `Dept: ${dept || 'All'}\n` +
    `Total Defaulters: *${rows.length}*\n` +
    `Critical (<75%): *${rows.filter(r => r.AttStatus === 'CRITICAL').length}*\n` +
    `Generating ${format.toUpperCase()}...`
  );

  await sendFile(from, rows, title, 'Defaulters', format);
}

// ─── Report Help Menu ─────────────────────────────────────────────
async function sendReportMenu(from) {
  await sendTextMessage(from,
    `📊 *REPORT COMMANDS*\n\n` +
    `*Student Reports:*\n` +
    `▪ student report\n` +
    `▪ year 1 student report\n` +
    `▪ year 2 student report excel\n` +
    `▪ year 3 student report pdf\n\n` +
    `*Attendance Reports:*\n` +
    `▪ attendance report\n` +
    `▪ year 2 attendance report\n` +
    `▪ attendance report pdf\n\n` +
    `*Results Reports:*\n` +
    `▪ results report\n` +
    `▪ year 3 results report\n` +
    `▪ results report pdf\n\n` +
    `*Other Reports:*\n` +
    `▪ dept summary report\n` +
    `▪ defaulters report\n` +
    `▪ defaulters report pdf\n\n` +
    `Default format: Excel\n` +
    `Add "pdf" for PDF format`
  );
}
// ─── Generate All Reports (4 years × Student + Attendance + Results) ──
async function generateAllReports(from, user) {
  try {
    const dept = (user.role === 'ADMIN' || user.role === 'PRINCIPAL') ? null : user.department;

    await sendTextMessage(from,
      `📦 *Generating All Reports...*\n\n` +
      `4 Years × 3 Types = *12 Reports*\n` +
      `Student + Attendance + Results\n\n` +
      `⏳ Please wait...`
    );

    const years  = [1, 2, 3, 4];
    const types  = ['student', 'attendance', 'results'];
    let   count  = 0;
    const failed = [];

    for (const year of years) {
      for (const type of types) {
        try {
          await sendTextMessage(from,
            `⏳ Generating Year ${year} — ${type.charAt(0).toUpperCase() + type.slice(1)} report...`
          );

          let rows  = [];
          let title = '';
          let sheet = '';

          const depts  = getDepts(dept);
          const currYY = new Date().getFullYear() % 100;

          if (type === 'student') {
            // ── Student report ──────────────────────────────
            const filter = { yearOfStudy: year };
            if (dept) filter.department = new RegExp(dept, 'i');
            const students = await Student.find(filter).lean();

            students.forEach(s => {
              rows.push({
                RegisterNumber: s.registerNumber || '',
                Name:           s.name || '',
                Department:     s.department || '',
                Year:           s.yearOfStudy || '',
                Section:        s.section || '',
                Batch:          s.batchYear || '',
                Gender:         s.gender || '',
                DOB:            s.dob ? (() => {
                  const d = new Date(s.dob);
                  return `${d.getUTCDate()}/${d.getUTCMonth()+1}/${d.getUTCFullYear()}`;
                })() : '',
                Mobile:         s.mobileNumber || '',
                Email:          s.email || '',
                BloodGroup:     s.bloodGroup || '',
                Community:      s.community || '',
                Hostel:         s.hostelStudent || '',
                FatherName:     s.fatherName || '',
                FatherMobile:   s.fatherMobile || '',
                MotherName:     s.motherName || '',
                CGPA:           s.cgpa || '',
                Arrear:         s.arrear || '',
              });
            });

            rows  = sortByRegNo(rows, 'RegisterNumber');
            title = `Year ${year} Student Report`;
            sheet = `Year${year} Students`;

          } else if (type === 'attendance') {
            // ── Attendance report ───────────────────────────
            for (const d of depts) {
              try {
                const { Attendance } = getDeptModels(d);
                const empCodes = await Attendance.distinct('empCode');

                for (const empCode of empCodes) {
                  if (!empCode) continue;
                  const records = await Attendance.find({ empCode }).lean();
                  if (!records.length) continue;

                  const yr = records[0]?.yearOfStudy;
                  if (yr !== year) continue;

                  const present = records.filter(r => r.status === 'P').length;
                  const absent  = records.filter(r => r.status === 'A').length;
                  const total   = present + absent;
                  if (total === 0) continue;
                  const pct = ((present / total) * 100).toFixed(1);

                  rows.push({
                    EmpCode:    empCode,
                    Name:       records[0]?.name || '',
                    Department: d.toUpperCase(),
                    Year:       yr || '',
                    TotalDays:  total,
                    Present:    present,
                    Absent:     absent,
                    Percentage: pct + '%',
                    Status:     parseFloat(pct) >= 95 ? 'Good' :
                                parseFloat(pct) >= 75 ? 'Average' : 'AT RISK',
                  });
                }
              } catch (_) { continue; }
            }

            rows  = sortByRegNo(rows, 'EmpCode');
            title = `Year ${year} Attendance Report`;
            sheet = `Year${year} Attendance`;

          } else if (type === 'results') {
            // ── Results report ──────────────────────────────
            for (const d of depts) {
              try {
                const models = getDeptModels(d);
                const Result = models.Result || models.Results;
                if (!Result) continue;

                const records = await Result.find({}).lean();
                records.forEach(r => {
                  const prefix = r.rollNo ? parseInt(r.rollNo.toString().substring(0, 2)) : null;
                  const yr     = prefix ? currYY - prefix + 1 : null;
                  if (yr !== year) return;

                  rows.push({
                    RollNo:     r.rollNo || '',
                    Department: d.toUpperCase(),
                    Semester:   r.semester || '',
                    Subject:    r.subject || '',
                    Grade:      r.grade || '',
                    SGPA:       r.sgpa ? parseFloat(r.sgpa).toFixed(2) : '',
                    CGPA:       r.cgpa ? parseFloat(r.cgpa).toFixed(2) : '',
                    Status:     r.status || '',
                    Arrears:    r.arrears || 0,
                  });
                });
              } catch (_) { continue; }
            }

            rows  = sortByRegNo(rows, 'RollNo');
            title = `Year ${year} Results Report`;
            sheet = `Year${year} Results`;
          }

          if (rows.length === 0) {
            await sendTextMessage(from, `⚠️ Year ${year} ${type} — No data found, skipping.`);
            continue;
          }

          // Generate both Excel and PDF
          const xlsxPath = await saveExcel(rows, title, sheet);
          await sendDocument(from, xlsxPath, `Year${year}_${type}_report.xlsx`);
          await fs.remove(xlsxPath);
          await new Promise(r => setTimeout(r, 500));

          try {
            const pdfPath = await savePDF(rows, title);
            if (pdfPath) {
              await sendDocument(from, pdfPath, `Year${year}_${type}_report.pdf`);
              await fs.remove(pdfPath);
              await new Promise(r => setTimeout(r, 500));
            }
          } catch (_) {}

          count++;
        } catch (err) {
          failed.push(`Year${year} ${type}`);
          logger.error(`Report failed Year${year} ${type}: ` + err.message);
        }
      }

      await sendTextMessage(from, `✅ Year ${year} — All 3 reports done!`);
      await new Promise(r => setTimeout(r, 1000));
    }

    let summary = `🎉 *All Reports Generated!*\n\n`;
    summary += `✅ Success : ${count} reports\n`;
    if (failed.length > 0) summary += `❌ Failed  : ${failed.join(', ')}\n`;
    summary += `\nTotal files sent: ${count * 2} (Excel + PDF each)`;
    await sendTextMessage(from, summary);

  } catch (err) {
    logger.error('generateAllReports error: ' + err.message);
    await sendTextMessage(from, '❌ Error: ' + err.message);
  }
}
module.exports = { handleReport, sendReportMenu, generateAllReports };
