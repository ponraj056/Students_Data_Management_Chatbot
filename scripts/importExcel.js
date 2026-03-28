require('dotenv').config();
const mongoose = require('mongoose');
const XLSX     = require('xlsx');
const fs       = require('fs');

const { getDeptModels } = require('../src/models/deptModels');

const filePath = process.argv[2];
const dept     = (process.argv[3] || '').toUpperCase().trim();

if (!filePath || !dept) { console.log('Usage: node scripts/importExcel.js <file.xlsx> <DEPT>'); process.exit(1); }
if (!fs.existsSync(filePath)) { console.error('File not found:', filePath); process.exit(1); }

function findHeaderRow(rawRows) {
  for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
    const row = rawRows[i].map(c => String(c).toLowerCase());
    if (row.some(c => c.includes('regno') || c.includes('roll') || c.includes('reg no'))) return i;
  }
  return 0;
}

function getCol(row, headers, ...keys) {
  for (const key of keys) {
    const norm = key.toLowerCase().replace(/[\s_\-\.]/g, '');
    const idx  = headers.findIndex(h => String(h).toLowerCase().replace(/[\s_\-\.]/g, '').includes(norm));
    if (idx !== -1 && row[idx] !== undefined && String(row[idx]).trim() !== '') return String(row[idx]).trim();
  }
  return '';
}

function getDateCols(headers) {
  return headers.map((h, i) => ({ label: String(h).trim(), idx: i }))
    .filter(c => /^\d{1,2}[-\/][a-zA-Z0-9]{2,3}/.test(c.label));
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'college_db' });
  console.log('✅ MongoDB Connected → college_db');

  const { Student, Attendance, Result } = getDeptModels(dept);
  const wb = XLSX.readFile(filePath);
  console.log('Sheets:', wb.SheetNames.join(', '));

  let students = 0, attendance = 0, results = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet   = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rawRows.length < 2) continue;

    const headerIdx = findHeaderRow(rawRows);
    const headers   = rawRows[headerIdx].map(h => String(h).trim());
    const dataRows  = rawRows.slice(headerIdx + 1).filter(r => r.some(c => c !== ''));
    if (!dataRows.length) continue;

    console.log('\nSheet: "' + sheetName + '" | header row: ' + headerIdx + ' | data: ' + dataRows.length);
    console.log('Columns:', headers.filter(Boolean).join(', '));

    const nameLow  = sheetName.toLowerCase();
    const dateCols = getDateCols(headers);
    const isAttend = nameLow.includes('attend') || dateCols.length > 5;
    const isResult = nameLow.includes('result') || nameLow.includes('mark') || nameLow.includes('exam') ||
                     headers.some(h => /cgpa|grade|internal|external/i.test(h));

    if (isAttend && dateCols.length > 0) {
      const rollIdx = headers.findIndex(h => /roll|reg/i.test(h));
      const nameIdx = headers.findIndex(h => /^name$/i.test(h));
      if (rollIdx === -1) { console.log('  ⚠️ No Roll column'); continue; }
      const ops = [];
      for (const row of dataRows) {
        const rollNo = String(row[rollIdx] || '').trim().toUpperCase();
        if (!rollNo) continue;
        const name = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
        dateCols.forEach(col => {
          const raw = String(row[col.idx] || '').trim().toUpperCase();
          if (!raw) return;
          const status = (raw === 'P' || raw === '1') ? 'P' : raw === 'L' ? 'L' : 'A';
          ops.push({ updateOne: { filter: { rollNo, date: col.label, subject: sheetName }, update: { $set: { rollNo, name, date: col.label, subject: sheetName, status, uploadedBy: 'script', uploadedAt: new Date() } }, upsert: true } });
        });
        if (ops.length >= 500) { await Attendance.bulkWrite(ops.splice(0, 500), { ordered: false }); process.stdout.write('.'); }
      }
      if (ops.length) { await Attendance.bulkWrite(ops, { ordered: false }); attendance += ops.length; }
      console.log('\n  ✅ Attendance saved');
    } else if (isResult) {
      const ops = dataRows.filter(row => getCol(row, headers, 'REGNO', 'Roll No', 'RollNo'))
        .map(row => {
          const rollNo = getCol(row, headers, 'REGNO', 'Roll No', 'RollNo').toUpperCase();
          return { updateOne: { filter: { rollNo, subject: getCol(row, headers, 'Subject') || 'General', semester: parseInt(getCol(row, headers, 'Semester', 'Sem')) || 0 }, update: { $set: { rollNo, name: getCol(row, headers, 'Name', 'Student Name') || '', semester: parseInt(getCol(row, headers, 'Semester', 'Sem')) || 0, subject: getCol(row, headers, 'Subject') || '', internal: parseFloat(getCol(row, headers, 'Internal', 'INT', 'IA')) || 0, external: parseFloat(getCol(row, headers, 'External', 'EXT')) || 0, total: parseFloat(getCol(row, headers, 'Total')) || 0, grade: getCol(row, headers, 'Grade') || '', cgpa: parseFloat(getCol(row, headers, 'CGPA', 'GPA')) || 0, status: getCol(row, headers, 'Status', 'Result') || 'PASS', uploadedBy: 'script', uploadedAt: new Date() } }, upsert: true } };
        });
      if (ops.length) { await Result.bulkWrite(ops, { ordered: false }); results += ops.length; }
      console.log('  ✅ Results saved:', ops.length);
    } else {
      const ops = [];
      for (const row of dataRows) {
        const rollNo = getCol(row, headers, 'REGNO', 'Roll No', 'RollNo', 'Reg No');
        if (!rollNo) continue;
        const deptCol  = getCol(row, headers, 'Department', 'Dept', 'DEPARTMENT');
        const batchVal = getCol(row, headers, 'Batch', 'BATCH');
        let year = null;
        if (batchVal && batchVal.includes('-')) { const s = parseInt(batchVal.split('-')[0]); if (s) { year = new Date().getFullYear() - s; if (year < 1) year = 1; if (year > 4) year = 4; } }
        let section = getCol(row, headers, 'Section', 'Sec');
        if (!section && deptCol && deptCol.includes('-')) section = deptCol.split('-').pop().trim();
        ops.push({ updateOne: { filter: { rollNo: rollNo.toUpperCase() }, update: { $set: { rollNo: rollNo.toUpperCase(), name: getCol(row, headers, 'Student Name', 'Name', 'STUDENTNAME') || 'Unknown', year, section, batch: batchVal, email: getCol(row, headers, 'Mail ID', 'Email', 'Mail', 'EMAIL'), phone: getCol(row, headers, 'Phone', 'Mobile'), status: 'Active', course: 'UG', uploadedBy: 'script', uploadedAt: new Date() } }, upsert: true } });
      }
      if (ops.length) { await Student.bulkWrite(ops, { ordered: false }); students += ops.length; }
      console.log('  ✅ Students saved:', ops.length);
    }
  }

  console.log('\n' + '='.repeat(40));
  console.log('✅ Import Complete!');
  console.log('Students   :', students);
  console.log('Attendance :', attendance);
  console.log('Results    :', results);
  console.log('='.repeat(40));

  const count = await Student.countDocuments();
  console.log('Verify: ' + count + ' students in ' + dept.toLowerCase() + '_students collection');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });