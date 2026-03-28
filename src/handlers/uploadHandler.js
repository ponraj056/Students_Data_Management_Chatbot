const fs   = require('fs-extra');
const XLSX = require('xlsx');
const path = require('path');
const { downloadMedia }       = require('../whatsapp/mediaDownloader');
const { sendTextMessage }     = require('../whatsapp/sender');
const { getDeptModels }       = require('../models/deptModels');
const { deptFromFilename }    = require('../utils/deptMapper');
const { parseVSBResultExcel } = require('../parsers/resultParser');
const Student = require('../models/studentModel');
const logger = require('../utils/logger');

const EXAMPLE_MSG =
`Excel Upload Format Guide
${'═'.repeat(30)}

1. Student Master
   Columns: Register Number | Name | DOB | Gender
            Blood Group | Aadhaar | Community | Religion
            Mobile | Email | Address | Hostel | College Bus
            Father Name | Father Mobile | Mother Name | Mother Mobile
            Department | Course | Batch | Section | Year
            10th School | 10th % | 12th School | 12th %
            CGPA | Arrear | Placement Status

2. Attendance (Any Format)
   Date taken from filename: 01-03-26 IT REPORT.xlsx
   Values: Present / Absent / P / A

3. Results
   VSB standard result format supported

${'═'.repeat(30)}
Filename must start with dept code:
IT_students.xlsx / CSE_attendance.xlsx

Send your Excel file now.`;

function dateFromFilename(filename) {
  const m = filename.match(/(\d{2})[-\/](\d{2})[-\/](\d{2,4})/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m[2])-1];
  return mon ? day + '-' + mon : null;
}

function findHeaderRow(rawRows) {
  for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
    const row = rawRows[i].map(c => String(c || '').toLowerCase());
    if (row.some(c =>
      c.includes('name') || c.includes('regno') || c.includes('roll') ||
      c.includes('emp') || c.includes('status') || c.includes('present') ||
      c.includes('register number')
    )) return i;
  }
  return 0;
}

function findColumns(headers) {
  const h = headers.map(x => String(x || '').toLowerCase().trim());
  const rollIdx   = h.findIndex(x => x.includes('regno') || x.includes('roll') || x.includes('emp code') || x.includes('reg no') || x.includes('register'));
  const nameIdx   = h.findIndex(x => x.includes('name') && !x.includes('last') && !x.includes('dept') && !x.includes('parent') && !x.includes('father'));
  const statusIdx = h.findIndex(x => x.includes('status') || x.includes('present') || x.includes('absent') || x === 'p/a');
  return { rollIdx, nameIdx, statusIdx };
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

function normalizeStatus(val) {
  const v = String(val || '').toLowerCase().trim();
  if (v === 'present' || v === 'p' || v === '1' || v === 'yes') return 'P';
  return 'A';
}

function normalizeHostel(val) {
  const v = String(val || '').toLowerCase();
  if (v.includes('hostel')) return 'Hostel';
  if (v.includes('day'))    return 'Day Scholar';
  return '';
}

// ─── DOB Parser — handles DD/MM/YYYY, serial numbers, ISO ────────
function parseDOB(val) {
  if (!val || String(val).trim() === '') return null;
  const s = String(val).trim();

  // Excel serial number (e.g., 38670)
  const serial = parseFloat(s);
  if (!isNaN(serial) && serial > 30000 && serial < 60000) {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  // DD/MM/YYYY
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmm) return new Date(Date.UTC(+ddmm[3], +ddmm[2] - 1, +ddmm[1]));

  // DD-MM-YYYY
  const ddmm2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmm2) return new Date(Date.UTC(+ddmm2[3], +ddmm2[2] - 1, +ddmm2[1]));

  // YYYY-MM-DD or ISO
  const iso = new Date(s);
  if (!isNaN(iso)) return new Date(Date.UTC(iso.getUTCFullYear(), iso.getUTCMonth(), iso.getUTCDate()));

  return null;
}

function isVSBResultFormat(rawRows) {
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i] || [];
    if (row.some(c => String(c).toLowerCase().includes('subject #') || 
      String(c).toLowerCase().includes('subject#'))) {
      return true;
    }
  }
  return false;
}

async function parseAndSave(filePath, dept, uploadedBy, filename) {
  const deptKey = dept.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const { Attendance, Results } = getDeptModels(deptKey);
  const wb = XLSX.readFile(filePath);
  let students = 0, attendance = 0, results = 0;
  const dateFromFile = dateFromFilename(filename || path.basename(filePath));

  for (const sheetName of wb.SheetNames) {
    const sheet   = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rawRows.length < 2) continue;

    const headerIdx = findHeaderRow(rawRows);
    const headers   = rawRows[headerIdx].map(h => String(h).trim());
    const dataRows  = rawRows.slice(headerIdx + 1).filter(r => r.some(c => c !== ''));
    if (!dataRows.length) continue;

    logger.info('Sheet: "' + sheetName + '" | headerRow:' + headerIdx + ' | rows:' + dataRows.length);

    // VSB Result format
    if (isVSBResultFormat(rawRows)) {
      const parsed = parseVSBResultExcel(rawRows);
      if (parsed.length > 0) {
        const ops = parsed.map(r => ({
          updateOne: {
            filter: { rollNo: r.rollNo, subject: r.subject, semester: r.semester },
            update: { $set: { ...r, uploadedBy, uploadedAt: new Date() } },
            upsert: true,
          }
        }));
        await Result.bulkWrite(ops, { ordered: false });
        results += ops.length;
      }
      continue;
    }

    const nameLow                         = sheetName.toLowerCase();
    const dateCols                        = getDateCols(headers);
    const { rollIdx, nameIdx, statusIdx } = findColumns(headers);

    const isAttend = nameLow.includes('attend') || nameLow.includes('report') || statusIdx !== -1 || dateCols.length > 3 || dateFromFile !== null;
    const filenameLC = (filename || '').toLowerCase();
const isResult = nameLow.includes('result') || nameLow.includes('mark') ||
  nameLow.includes('exam') || filenameLC.includes('result') ||
  filenameLC.includes('mark') || filenameLC.includes('grade') ||
  headers.some(h => /cgpa|grade|internal|external|semester|subject/i.test(h));

    // Date-column attendance
    if (dateCols.length > 3) {
      const ops = [];
      for (const row of dataRows) {
        const rollNo = String(row[rollIdx !== -1 ? rollIdx : 0] || '').trim().toUpperCase();
        const name   = nameIdx !== -1 ? String(row[nameIdx] || '').replace(/\n/g, ' ').trim() : '';
        if (!rollNo || rollNo.length < 3) continue;
        dateCols.forEach(col => {
          const raw = String(row[col.idx] || '').trim();
          if (!raw) return;
          ops.push({ updateOne: {
            filter: { name, date: col.label },
            update: { $set: { rollNo, name, date: col.label, status: normalizeStatus(raw), uploadedBy, uploadedAt: new Date() } },
            upsert: true,
          }});
        });
        if (ops.length >= 500) await Attendance.bulkWrite(ops.splice(0, 500), { ordered: false });
      }
      if (ops.length) { await Attendance.bulkWrite(ops, { ordered: false }); attendance += ops.length; }
      continue;
    }

    // Daily attendance file
    if (isAttend && statusIdx !== -1 && dateFromFile) {
      const ops = [];
      for (const row of dataRows) {
        const name = nameIdx !== -1 ? String(row[nameIdx] || '').replace(/\n/g, ' ').trim() : '';
        if (!name || name.length < 2) continue;
        const rollNo = rollIdx !== -1 ? String(row[rollIdx] || '').trim().toUpperCase() : name.toUpperCase().replace(/\s+/g, '_');
        const statusVal = String(row[statusIdx] || '').trim();
        if (!statusVal) continue;
        ops.push({ updateOne: {
          filter: { name, date: dateFromFile },
          update: { $set: { rollNo, name, date: dateFromFile, status: normalizeStatus(statusVal), uploadedBy, uploadedAt: new Date() } },
          upsert: true,
        }});
      }
      if (ops.length) { await Attendance.bulkWrite(ops, { ordered: false }); attendance += ops.length; }
      continue;
    }

    // Standard results
    if (isResult) {
      const ops = dataRows
        .filter(row => getCol(row, headers, 'REGNO','Roll No','RollNo','Register Number'))
        .map(row => {
          const rollNo = getCol(row, headers, 'REGNO','Roll No','RollNo','Register Number').toUpperCase();
          return { updateOne: {
            filter: { rollNo, subject: getCol(row, headers, 'Subject') || 'General', semester: parseInt(getCol(row, headers, 'Semester','Sem')) || 0 },
            update: { $set: {
              rollNo, name: getCol(row, headers, 'Name','Student Name') || '',
              semester: parseInt(getCol(row, headers, 'Semester','Sem')) || 0,
              subject:  getCol(row, headers, 'Subject') || '',
              internal: parseFloat(getCol(row, headers, 'Internal','INT','IA')) || 0,
              external: parseFloat(getCol(row, headers, 'External','EXT')) || 0,
              total:    parseFloat(getCol(row, headers, 'Total')) || 0,
              grade:    getCol(row, headers, 'Grade') || '',
              cgpa:     parseFloat(getCol(row, headers, 'CGPA','GPA')) || 0,
              status:   getCol(row, headers, 'Status','Result') || 'PASS',
              uploadedBy, uploadedAt: new Date(),
            }}, upsert: true,
          }};
        });
      if (ops.length) { await Results.bulkWrite(ops, { ordered: false }); results += ops.length; }
      continue;
    }

    // ── Student Master — field names match studentModel.js exactly ──
    const ops = [];
    for (const row of dataRows) {
      const regNo = getCol(row, headers,
        'Register Number', 'Reg No', 'REGNO', 'Roll No', 'RollNo', 'RegNo'
      );
      if (!regNo || !/^\d{6,15}$/.test(regNo.trim())) continue;

      const batchVal  = getCol(row, headers, 'Batch_Year', 'Batch', 'BATCH');
      const deptVal   = getCol(row, headers, 'Department', 'Dept', 'DEPARTMENT');
      let yearOfStudy = null;
      if (batchVal && batchVal.includes('-')) {
        const startYr = parseInt(batchVal.split('-')[0]);
        if (startYr) {
          yearOfStudy = new Date().getFullYear() - startYr;
          if (yearOfStudy < 1) yearOfStudy = 1;
          if (yearOfStudy > 4) yearOfStudy = 4;
        }
      }

      let section = getCol(row, headers, 'Section', 'Sec');
      if (!section && deptVal && deptVal.includes('-')) section = deptVal.split('-').pop().trim();

      ops.push({ updateOne: {
        filter: { registerNumber: regNo.trim() },
        update: { $set: {
          registerNumber:    regNo.trim(),
          name:              getCol(row, headers, 'Name', 'Student Name', 'STUDENTNAME') || 'Unknown',
          gender:            getCol(row, headers, 'Gender', 'GENDER', 'Sex'),
          dob:               parseDOB(getCol(row, headers, 'DOB', 'Date of Birth', 'DateOfBirth', 'Birth Date')),
          bloodGroup:        getCol(row, headers, 'Blood_Group', 'Blood Group', 'Blood', 'BLOOD GROUP', 'BG'),
          aadhaarNumber:     getCol(row, headers, 'Aadhaar_Number', 'Aadhaar', 'Aadhar', 'Aadhar No', 'AADHAR'),
          community:         getCol(row, headers, 'Community', 'COMMUNITY'),
          religion:          getCol(row, headers, 'Religion', 'RELIGION'),
          photo:             getCol(row, headers, 'photo', 'Photo', 'Photo URL', 'Photo Link'),
          cutoffMark:        parseFloat(getCol(row, headers, 'Cutoff_Mark', 'Cutoff', 'Cut Off')) || null,
          mobileNumber:      getCol(row, headers, 'Mobile_Number', 'Mobile', 'Phone', 'Ph No', 'PHONE'),
          email:             getCol(row, headers, 'Email', 'Mail ID', 'Mail', 'EMAIL'),
          address:           getCol(row, headers, 'Address_Line1', 'Address', 'Permanent Address', 'ADDRESS'),
          hostelStudent:     normalizeHostel(getCol(row, headers, 'Hostel_Student ', 'Hostel Student', 'Hostel', 'Accommodation', 'DAY/HOSTELER')),
          collegeBusUser:    getCol(row, headers, 'College bus user ', 'College Bus User', 'College Bus', 'Bus Route', 'Bus'),
          fatherName:        getCol(row, headers, 'Father_Name', 'Father Name', 'FATHER NAME'),
          fatherOccupation:  getCol(row, headers, 'Father_Occupation', 'Father Occupation', 'FATHER OCC'),
          fatherMobile:      getCol(row, headers, 'Father_Mobile_Number', 'Father Mobile', 'Father Phone', 'FATHER PHONE'),
          motherName:        getCol(row, headers, 'Mother_Name', 'Mother Name', 'MOTHER NAME'),
          motherOccupation:  getCol(row, headers, 'Mother_Occupation', 'Mother Occupation', 'MOTHER OCC'),
          motherMobile:      getCol(row, headers, 'Mother_Mobile_Number', 'Mother Mobile', 'Mother Phone', 'MOTHER PHONE'),
          guardianName:      getCol(row, headers, 'Guardian_Name', 'Guardian Name', 'Guardian'),
          guardianMobile:    getCol(row, headers, 'Guardian_Mobile_Number', 'Guardian Mobile', 'Guardian Phone'),
          numberOfSiblings:  parseInt(getCol(row, headers, 'Number of sibilings', 'Siblings', 'No of Siblings')) || null,
          department:        deptVal || dept,
          course:            getCol(row, headers, 'Course', 'COURSE') || 'UG',
          batchYear:         batchVal,
          yearOfStudy,
          section,
          admissionType:     getCol(row, headers, 'Admission_Type', 'Admission Type', 'ADMISSION'),
          firstGraduate:     getCol(row, headers, 'First Graduate', 'First Grad', 'FIRST GRADUATE'),
          tenthSchool:       getCol(row, headers, '10th_School_Name', '10th School', 'TENTH SCHOOL'),
          tenthPercentage:   getCol(row, headers, '10th_Percentage', '10th %', '10th Percentage'),
          twelfthSchool:     getCol(row, headers, '12th_school_name', '12th School', 'TWELFTH SCHOOL'),
          twelfthPercentage: getCol(row, headers, '12th_Percentage', '12th %', '12th Percentage'),
          twelfthGroup:      getCol(row, headers, '12th_Group', '12th Group', 'Group'),
          diplomaCollege:    getCol(row, headers, 'Diploma_College_Name', 'Diploma College'),
          diplomaPercentage: getCol(row, headers, 'Diploma_Percentage', 'Diploma %'),
          arrear:            getCol(row, headers, 'Arrear', 'Arrears', 'No of Arrears', 'ARREAR COUNT'),
          cgpa:              parseFloat(getCol(row, headers, 'CGPA', 'GPA')) || null,
          placementStatus:   getCol(row, headers, 'Placement_Status (Placed or Not)', 'Placement Status', 'Placement'),
          numberOfCompanies: getCol(row, headers, 'Number of Company', 'No of Companies', 'Companies'),
          parentsIncome:     getCol(row, headers, "Parent's Income", 'Parents Income', 'Income'),
          updatedAt:         new Date(),
        }}, upsert: true,
      }});
    }
    if (ops.length) {
      await Student.bulkWrite(ops, { ordered: false });
      students += ops.length;
      logger.info('Students upserted: ' + ops.length);
    }
  }

  return { students, attendance, results };
}

async function sendExampleFormat(from) {
  await sendTextMessage(from, EXAMPLE_MSG);
}

async function handleUpload(from, message, user) {
  const msgType  = message.type;
  const mediaObj = message[msgType];
  const filename = (mediaObj.filename || 'upload_' + Date.now() + '.xlsx').trim();
  const mimeType = mediaObj.mime_type || '';

  const isExcel = mimeType.includes('spreadsheet') || mimeType.includes('excel') ||
                  filename.endsWith('.xlsx') || filename.endsWith('.xls');
  if (!isExcel) {
    await sendTextMessage(from, 'Please send an Excel (.xlsx) file only.\nExample: IT_students.xlsx');
    return;
  }

  await sendTextMessage(from, filename + ' received. Processing...');

  let filePath = null;
  try {
    filePath = await downloadMedia(mediaObj.id, filename);

    let dept = deptFromFilename(filename);
    if (!dept && user.role !== 'ADMIN' && user.role !== 'PRINCIPAL') dept = user.department;
    if (!dept) {
      await sendTextMessage(from, 'Could not detect department from filename.\nPlease start with dept code: IT_students.xlsx');
      return;
    }
    dept = dept.toUpperCase().trim();

    if (user.role !== 'ADMIN' && user.role !== 'PRINCIPAL' && dept !== user.department.toUpperCase()) {
      await sendTextMessage(from, 'You are a ' + user.department + ' faculty.\nYou cannot upload data for ' + dept + '.');
      return;
    }

    const stats = await parseAndSave(filePath, dept, user.empId || from, filename);

    let msg = filename + ' uploaded successfully!\n\n';
    msg += 'Summary\n' + '═'.repeat(28) + '\n';
    msg += 'Department  : ' + dept + '\n';
    if (stats.students)   msg += 'Students    : ' + stats.students + '\n';
    if (stats.attendance) msg += 'Attendance  : ' + stats.attendance + ' records\n';
    if (stats.results)    msg += 'Results     : ' + stats.results + ' records\n';
    if (!stats.students && !stats.attendance && !stats.results) {
      msg += 'Warning: No data was parsed. Please check the file format.\n';
    }
    msg += '═'.repeat(28) + '\nType menu to continue.';
    await sendTextMessage(from, msg);

  } catch (err) {
    logger.error('Upload error: ' + err.message);
    await sendTextMessage(from,
      'Upload failed!\nError: ' + err.message +
      '\n\nPlease try again.\nYou can send another file or type menu to continue.'
    );
  } finally {
    if (filePath) try { await fs.remove(filePath); } catch (_) {}
  }
}

module.exports = { handleUpload, sendExampleFormat };