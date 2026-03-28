const path = require('path');
const fs   = require('fs-extra');
const XLSX = require('xlsx');
const { sendTextMessage, sendDocument } = require('../whatsapp/sender');
const { getDeptModels } = require('../models/deptModels');
const logger = require('../utils/logger');

const OUTPUT_DIR = process.env.OUTPUT_DIR || './outputs';

async function handleReport(from, query, user, format = 'excel') {
  try {
    const dept  = (user.role === 'ADMIN' || user.role === 'PRINCIPAL') ? null : user.department;
    const depts = dept
      ? [dept]
      : ['AIDS','AIML','BIOMED','BIOTECH','CSBS','CSE','CIVIL','CHEMICAL','CCE','ECE','EEE','IT','MECH','ME','MCA','MBA'];

    const isAttend = /attend/i.test(query);
    const isResult = /result|mark|exam/i.test(query);

    await sendTextMessage(from, 'Generating report...');

    let rows  = [];
    let title = '';

    // ── Attendance Report ─────────────────────────────────────────
    if (isAttend) {
      title = 'Attendance Report';
      for (const d of depts) {
        const { Attendance } = getDeptModels(d);

        // Group by empCode (unique student identifier in VSB format)
        const allEmpCodes = await Attendance.distinct('empCode');

        // If empCode not stored yet, fall back to grouping by name
        if (!allEmpCodes || allEmpCodes.length === 0 || allEmpCodes[0] === undefined) {
          const allNames = await Attendance.distinct('name');
          for (const name of allNames) {
            if (!name) continue;
            const records    = await Attendance.find({ name }).lean();
            if (!records.length) continue;
            const present    = records.filter(r => r.status === 'P').length;
            const absent     = records.filter(r => r.status === 'A').length;
            const leave      = records.filter(r => r.status === 'L').length;
            const validTotal = present + absent + leave;
            if (validTotal === 0) continue;
            const pct = (present / validTotal * 100).toFixed(1);
            rows.push({
              Dept: d.toUpperCase(),
              EmpCode: records[0].empCode || '',
              Name: name,
              Present: present,
              Absent: absent,
              Leave: leave,
              TotalDays: validTotal,
              Percentage: pct + '%',
              Status: parseFloat(pct) < 75 ? 'AT RISK' : 'OK'
            });
          }
        } else {
          for (const empCode of allEmpCodes) {
            if (!empCode) continue;
            const records    = await Attendance.find({ empCode }).lean();
            if (!records.length) continue;
            const present    = records.filter(r => r.status === 'P').length;
            const absent     = records.filter(r => r.status === 'A').length;
            const leave      = records.filter(r => r.status === 'L').length;
            const validTotal = present + absent + leave;
            if (validTotal === 0) continue;
            const pct = (present / validTotal * 100).toFixed(1);
            rows.push({
              Dept: d.toUpperCase(),
              EmpCode: empCode,
              Name: records[0].name || '',
              Present: present,
              Absent: absent,
              Leave: leave,
              TotalDays: validTotal,
              Percentage: pct + '%',
              Status: parseFloat(pct) < 75 ? 'AT RISK' : 'OK'
            });
          }
        }
      }

    // ── Results Report ────────────────────────────────────────────
    } else if (isResult) {
      title = 'Results Report';
      for (const d of depts) {
        const { Result } = getDeptModels(d);
        const records = await Result.find({}).lean();
        records.forEach(r => {
          rows.push({
            Dept: d.toUpperCase(),
            RollNo: r.rollNo,
            Name: r.name || '',
            Semester: r.semester,
            Subject: r.subject || '',
            Internal: r.internal,
            External: r.external,
            Total: r.total,
            Grade: r.grade || '',
            CGPA: r.cgpa || '',
            Status: r.status
          });
        });
      }

    // ── Student Master Report ─────────────────────────────────────
    } else {
      title = 'Student Master Report';
      for (const d of depts) {
        const { Student } = getDeptModels(d);
        const students = await Student.find({}).lean();
        students.forEach(s => {
          rows.push({
            Dept: d.toUpperCase(),
            RollNo: s.rollNo,
            Name: s.name,
            Year: s.year || '',
            Section: s.section || '',
            Batch: s.batch || '',
            Email: s.email || '',
            Phone: s.phone || '',
            Status: s.status || 'Active'
          });
        });
      }
    }

    if (!rows.length) {
      await sendTextMessage(from, 'No data found. Upload Excel first.');
      return;
    }

    await fs.ensureDir(OUTPUT_DIR);
    const timestamp = Date.now();

    // ── Excel ─────────────────────────────────────────────────────
    if (format === 'excel') {
      const filePath = path.join(OUTPUT_DIR, title.replace(/ /g, '_') + '_' + timestamp + '.xlsx');
      const wb = XLSX.utils.book_new();

      // Add college header rows
      const headerRows = [
        ['V.S.B ENGINEERING COLLEGE'],
        [title + ' - Generated: ' + new Date().toLocaleDateString('en-IN')],
        [],
        Object.keys(rows[0])
      ];
      const dataRows = rows.map(r => Object.values(r));
      const allRows  = [...headerRows, ...dataRows];

      const ws = XLSX.utils.aoa_to_sheet(allRows);

      // Column widths
      ws['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 20 }));

      // Merge header cell across all columns
      const colCount = Object.keys(rows[0]).length;
      ws['!merges'] = [
        { s: { r:0, c:0 }, e: { r:0, c: colCount-1 } },
        { s: { r:1, c:0 }, e: { r:1, c: colCount-1 } }
      ];

      XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
      XLSX.writeFile(wb, filePath);
      await sendDocument(from, filePath, title + '.xlsx');
      await fs.remove(filePath);

    // ── PDF ───────────────────────────────────────────────────────
    } else if (format === 'pdf') {
      try {
        const PDFDocument = require('pdfkit');
        const filePath = path.join(OUTPUT_DIR, title.replace(/ /g, '_') + '_' + timestamp + '.pdf');
        const doc    = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        doc.fontSize(14).font('Helvetica-Bold').text('V.S.B ENGINEERING COLLEGE', { align: 'center' });
        doc.fontSize(11).font('Helvetica').text(title + ' — ' + new Date().toLocaleDateString('en-IN'), { align: 'center' });
        doc.moveDown();

        const headers = Object.keys(rows[0]).join(' | ');
        doc.fontSize(8).font('Helvetica-Bold').text(headers);
        doc.font('Helvetica');
        rows.slice(0, 300).forEach(row => {
          doc.fontSize(7).text(Object.values(row).join(' | '), { lineBreak: true });
        });

        doc.end();
        await new Promise(resolve => stream.on('finish', resolve));
        await sendDocument(from, filePath, title + '.pdf');
        await fs.remove(filePath);
      } catch (e) {
        // pdfkit not installed — fallback to excel
        logger.warn('pdfkit not available, sending Excel instead');
        const filePath = path.join(OUTPUT_DIR, title.replace(/ /g, '_') + '_' + timestamp + '.xlsx');
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), title.substring(0, 31));
        XLSX.writeFile(wb, filePath);
        await sendDocument(from, filePath, title + ' (Excel).xlsx');
        await fs.remove(filePath);
      }

    // ── Text Summary ──────────────────────────────────────────────
    } else {
      let msg = '*' + title + '*\n';
      msg += '----------------------------\n';
      msg += 'Total records: ' + rows.length + '\n';
      if (isAttend) {
        const atRisk = rows.filter(r => r.Status === 'AT RISK').length;
        msg += 'AT RISK (<75%): ' + atRisk + '\n';
        msg += 'Good (>=75%): ' + (rows.length - atRisk) + '\n';
      }
      msg += '----------------------------\n';
      msg += 'Send "report excel" or "report pdf" for full file';
      await sendTextMessage(from, msg);
    }

  } catch (err) {
    logger.error('Report error: ' + err.message);
    await sendTextMessage(from, 'Report error: ' + err.message);
  }
}

module.exports = { handleReport };