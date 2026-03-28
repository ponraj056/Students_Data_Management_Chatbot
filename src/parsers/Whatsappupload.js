// src/parsers/whatsappUpload.js
// Admin sends .xlsx on WhatsApp → saves to MongoDB Atlas
// Handles duplicate register numbers → keeps latest entry per student

const mongoose = require('mongoose');
const XLSX     = require('xlsx');
const axios    = require('axios');

const studentSchema = new mongoose.Schema({
  registerNumber:    String,
  name:              String,
  gender:            String,
  dob:               Date,
  bloodGroup:        String,
  aadhaarNumber:     String,
  community:         String,
  religion:          String,
  photo:             String,
  cutoffMark:        Number,
  mobileNumber:      String,
  email:             String,
  address:           String,
  hostelStudent:     String,
  collegeBusUser:    String,
  fatherName:        String,
  fatherOccupation:  String,
  fatherMobile:      String,
  motherName:        String,
  motherOccupation:  String,
  motherMobile:      String,
  guardianName:      String,
  guardianMobile:    String,
  guardianMobile2:   String,
  numberOfSiblings:  Number,
  department:        String,
  course:            String,
  batchYear:         String,
  yearOfStudy:       Number,
  section:           String,
  admissionType:     String,
  firstGraduate:     String,
  tenthSchool:       String,
  tenthPercentage:   mongoose.Schema.Types.Mixed,
  twelfthSchool:     String,
  twelfthPercentage: mongoose.Schema.Types.Mixed,
  twelfthGroup:      String,
  diplomaCollege:    String,
  diplomaPercentage: mongoose.Schema.Types.Mixed,
  arrear:            String,
  cgpa:              Number,
  placementStatus:   String,
  numberOfCompanies: mongoose.Schema.Types.Mixed,
  companyName:       String,
  highestPackage:    mongoose.Schema.Types.Mixed,
  internshipDetails: String,
  parentsIncome:     String,
  updatedAt:         { type: Date, default: Date.now },
}, { collection: 'students' });

const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);

// ─── Compute Year of Study from Batch Year ────────────────────────
function getYearOfStudy(batchYear) {
  if (!batchYear) return null;
  const startYear    = parseInt(batchYear.toString().split('-')[0]);
  const now          = new Date();
  const academicYear = now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const year         = academicYear - startYear + 1;
  return (year >= 1 && year <= 4) ? year : null;
}

// ─── Download file from WhatsApp ──────────────────────────────────
async function downloadWhatsAppFile(mediaId) {
  const mediaRes = await axios.get(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
  );
  const fileRes = await axios.get(mediaRes.data.url, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
  });
  return Buffer.from(fileRes.data);
}

// ─── Parse Excel → student objects ───────────────────────────────
function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rows     = XLSX.utils.sheet_to_json(sheet, { defval: null });

  rows.sort((a, b) => {
    const ta = a['Timestamp'] ? new Date(a['Timestamp']).getTime() : 0;
    const tb = b['Timestamp'] ? new Date(b['Timestamp']).getTime() : 0;
    return ta - tb;
  });

  const studentMap = new Map();
  for (const row of rows) {
    const regNo = row['Register Number']?.toString();
    if (regNo) studentMap.set(regNo, row);
  }

  const uniqueRows = Array.from(studentMap.values());

  function parseDate(val) {
    if (!val) return null;
    if (typeof val === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      const d = new Date(excelEpoch.getTime() + val * 86400000);
      return isNaN(d.getTime()) ? null : d;
    }
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = val.toString().trim();
    const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
      const [, dd, mm, yyyy] = dmyMatch;
      const d = new Date(`${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  return uniqueRows.map(row => ({
    registerNumber:    row['Register Number']                    ?.toString(),
    name:              row['Name']                               ?.toString().trim().toUpperCase(),
    gender:            row['Gender'],
    dob:               parseDate(row['DOB']),
    bloodGroup:        row['Blood_Group'],
    aadhaarNumber:     row['Aadhaar_Number']                     ?.toString(),
    community:         row['Community'],
    religion:          row['Religion'],
    photo:             row['photo'],
    cutoffMark:        parseFloat(row['Cutoff_Mark']) || null,
    mobileNumber:      row['Mobile_Number']                      ?.toString(),
    email:             row['Email'],
    address:           row['Address_Line1'],
    hostelStudent:     row['Hostel_Student ']                    ?.toString().trim(),
    collegeBusUser:    row['College bus user ']                  ?.toString().trim(),
    fatherName:        row['Father_Name'],
    fatherOccupation:  row['Father_Occupation'],
    fatherMobile:      row['Father_Mobile_Number']               ?.toString(),
    motherName:        row['Mother_Name'],
    motherOccupation:  row['Mother_Occupation'],
    motherMobile:      row['Mother_Mobile_Number']               ?.toString(),
    guardianName:      row['Guardian_Name'],
    guardianMobile:    row['Guardian_Mobile_Number']             ?.toString(),
    guardianMobile2:   row['Guardian_Mobile_Number 2']           ?.toString(),
    numberOfSiblings:  row['Number of sibilings'],
    department:        row['Department']                         ?.toString().trim().toUpperCase(),
    course:            row['Course'],
    batchYear:         row['Batch_Year']                         ?.toString(),
    yearOfStudy:       getYearOfStudy(row['Batch_Year']),
    section:           row['Section'],
    admissionType:     row['Admission_Type'],
    firstGraduate:     row['First Graduate'],
    tenthSchool:       row['10th_School_Name'],
    tenthPercentage:   row['10th_Percentage'],
    twelfthSchool:     row['12th_school_name'],
    twelfthPercentage: row['12th_Percentage'],
    twelfthGroup:      row['12th_Group'],
    diplomaCollege:    row['Diploma_College_Name'],
    diplomaPercentage: row['Diploma_Percentage'],
    arrear:            row['Arrear']                             ?.toString(),
    cgpa:              parseFloat(row['CGPA']) || null,
    placementStatus:   row['Placement_Status (Placed or Not)'],
    numberOfCompanies: row['Number of Company'],
    companyName:       row['Company_Name'],
    highestPackage:    row['Highest Package'],
    internshipDetails: row['Internship_Details'],
    parentsIncome:     row["Parent's Income"]                    ?.toString(),
    updatedAt:         row['Timestamp'] ? new Date(row['Timestamp']) : new Date(),
  }));
}

// ─── Check if file is any Excel format ───────────────────────────
function isExcelFile(message) {
  if (message?.type !== 'document') return false;
  const mime = message?.document?.mime_type || '';
  const name = message?.document?.filename  || '';
  return (
    mime.includes('spreadsheetml') ||
    mime.includes('excel') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls')
  );
}

// ─── Detect file type by reading column headers ───────────────────
async function detectExcelType(mediaId) {
  try {
    const buffer   = await downloadWhatsAppFile(mediaId);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];

    // VSB Result Format: scan first 10 rows for 'Subject #'
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
      const row = rawRows[i] || [];
      const hasSubjectHash = row.some(c =>
        String(c).toLowerCase().includes('subject #') ||
        String(c).toLowerCase().includes('subject#')
      );
      if (hasSubjectHash) return { type: 'results', buffer };
    }

    // Normal header-based detection
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    if (!rows || rows.length === 0) return { type: 'unknown', buffer };

    const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());

    // Student DB
    const isStudent =
      headers.some(h => h.includes('register') || h.includes('reg no') || h.includes('reg.no')) &&
      headers.some(h => h === 'name') &&
      headers.some(h => h.includes('department') || h === 'dept');
    if (isStudent) return { type: 'student', buffer };

    // Attendance
    const isAttendance =
      headers.some(h => h.includes('emp') || h.includes('employee')) &&
      (headers.some(h => h.includes('status')) || headers.some(h => h.includes('punch')));
    if (isAttendance) return { type: 'attendance', buffer };

    // Results
    const isResults =
      headers.some(h => h.includes('mark') || h.includes('grade') || h.includes('result') ||
                        h.includes('pass') || h.includes('fail') || h.includes('gpa') ||
                        h.includes('subject') || h.includes('semester') || h.includes('sem') ||
                        h.includes('rollno') || h.includes('roll_no') || h.includes('roll no'));
    if (isResults) return { type: 'results', buffer };

    return { type: 'unknown', buffer };

  } catch (err) {
    console.error('detectExcelType error:', err.message);
    return { type: 'error', error: err.message };
  }
}

// ─── Results Upload Handler (VSB Format) ─────────────────────────
async function handleResultsUpload(buffer, fileName) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rows || rows.length === 0) return '❌ Results file is empty!';

    // Detect dept from filename
    const knownDepts = ['IT','CSE','ECE','EEE','MECH','CIVIL','AIDS','AIML',
                        'CSBS','CCE','BIOMED','BIOTECH','CHEMICAL','MBA','MCA','ME'];
    const upperFile  = fileName.toUpperCase();
    const dept       = knownDepts.find(d => upperFile.includes(d)) || null;

    if (!dept) {
      return (
        `❌ Could not detect department from filename.\n\n` +
        `Filename must include dept name:\n` +
        `▪ IT_results.xlsx\n▪ CSE_results.xlsx\n▪ ECE_marks.xlsx`
      );
    }

    const { getDeptModels } = require('../models/deptModels');
    let Results;
try {
  const models = getDeptModels(dept);
  Results = models.Results || models.Result;
} catch (_) { return `❌ Unknown department: ${dept}`; }

    // ── Find header row (has 'Register Number' or 'S.No') ──────
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = rows[i].map(c => String(c).toLowerCase());
      if (r.some(c => c.includes('register') || c.includes('s.no') || c === 'sno')) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx === -1) return '❌ Could not find header row in file.';

    // Data starts 2 rows after header (header + subheader row)
    const dataStartIdx = headerRowIdx + 2;

    // ── Parse each data row ─────────────────────────────────────
    let inserted = 0;
    let updated  = 0;
    let skipped  = 0;

    for (let i = dataStartIdx; i < rows.length; i++) {
      const row = rows[i];

      const rollNo = row[1] ? row[1].toString().trim() : null;
      const sem    = parseInt(row[2]) || 0;

      // Skip empty or sub-rows (arrear rows have empty sno & rollNo)
      if (!rollNo || rollNo === '') { skipped++; continue; }

      // Status, GPA, CGPA are at fixed positions at end
      const rowLen  = row.length;
      const status  = row[rowLen - 4] ? row[rowLen - 4].toString().toUpperCase() : 'PASS';
      const sgpa    = parseFloat(row[rowLen - 2]) || 0;
      const cgpa    = parseFloat(row[rowLen - 1]) || 0;

      // Subjects start at index 3, each subject = 3 cols (code, grade, gp)
      // Positions: 3,4,5 = sub1 | 6,7,8 = sub2 | 9,10,11 = sub3 ...
      const subjectCount = Math.floor((rowLen - 7) / 3); // subtract sno,rollno,sem,result,reappear,gpa,cgpa

      for (let s = 0; s < subjectCount; s++) {
        const baseIdx = 3 + (s * 3);
        const code    = row[baseIdx]     ? row[baseIdx].toString().trim()     : null;
        const grade   = row[baseIdx + 1] ? row[baseIdx + 1].toString().trim() : '';
        const gp      = parseFloat(row[baseIdx + 2]) || 0;

        if (!code || code === '') continue;

        const subStatus = (grade === 'U' || grade === 'F' || gp === 0) ? 'FAIL' : 'PASS';

        const filter = { rollNo, subject: code, semester: sem };
        const update = {
          $set: {
            rollNo, subject: code, semester: sem,
            grade:    grade.toUpperCase(),
            internal: 0,
            external: 0,
            total:    gp,
            status:   subStatus,
            sgpa, cgpa,
            arrears:  status === 'FAIL' ? 1 : 0,
            uploadedAt: new Date(),
            uploadedBy: 'ADMIN',
          }
        };

        const res = await Results.updateOne(filter, update, { upsert: true });
        if (res.upsertedCount > 0) inserted++;
        else updated++;
      }
    }

    const totalStudents = rows.length - dataStartIdx;

    return (
      `✅ *Results Uploaded Successfully!*\n\n` +
      `📁 File       : ${fileName}\n` +
      `🏫 Department : ${dept}\n` +
      `👥 Students   : ${totalStudents}\n` +
      `🆕 Inserted   : ${inserted}\n` +
      `🔄 Updated    : ${updated}\n` +
      `⏭️ Skipped    : ${skipped}\n\n` +
      `🕒 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    );

  } catch (err) {
    console.error('Results upload error:', err.message);
    return `❌ Results upload failed: ${err.message}`;
  }
}

// ─── Smart Excel Handler ──────────────────────────────────────────
async function handleSmartExcelUpload(message) {
  if (!isExcelFile(message)) return null;

  const mediaId  = message.document.id;
  const fileName = message.document.filename || 'file.xlsx';

  // Detect type by content
  const { type, buffer, error } = await detectExcelType(mediaId);

  if (error) {
    return `❌ Could not read file: ${error}`;
  }

  if (type === 'student') {
    return await handleExcelUploadFromBuffer(buffer, fileName);
  }

  if (type === 'attendance') {
    return null; // Let existing attendance handler process it
  }

  if (type === 'results') {
    return await handleResultsUpload(buffer, fileName);
  }

  // Unknown format — show helpful message
  return (
    `⚠️ *Could not detect file type.*\n\n` +
    `Make sure your Excel file has these columns:\n\n` +
    `*Student DB:* Register Number, Name, Department\n` +
    `*Attendance:* Emp Code, Status, Last Punch\n` +
    `*Results:* RollNo, Subject, Semester, Grade\n\n` +
    `Please check and resend.`
  );
}

// ─── Upload from already-downloaded buffer ────────────────────────
async function handleExcelUploadFromBuffer(buffer, fileName) {
  try {
    const students = parseExcelBuffer(buffer);

    if (students.length === 0) {
      return `⚠️ Excel file is *empty*. Please check and resend.`;
    }

    await Student.deleteMany({});
    await Student.insertMany(students);

    const depts       = [...new Set(students.map(s => s.department).filter(Boolean))].sort();
    const years       = [...new Set(students.map(s => s.yearOfStudy).filter(Boolean))].sort();
    const deptSummary = depts.map(d => {
      const count = students.filter(s => s.department === d).length;
      return `  • ${d}: ${count} students`;
    }).join('\n');

    return (
      `✅ *Student Database Updated!*\n\n` +
      `📁 File      : ${fileName}\n` +
      `👥 Total     : ${students.length} students\n` +
      `📚 Depts     : ${depts.length}\n` +
      `🎓 Years     : ${years.join(', ')}\n\n` +
      `*Department Breakdown:*\n${deptSummary}\n\n` +
      `🕒 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n` +
      `Type *student details* to search students.`
    );

  } catch (err) {
    console.error('Upload error:', err.message);
    return `❌ *Upload failed!*\nError: ${err.message}\n\nPlease try again.`;
  }
}

// ─── Keep old function for backward compatibility ─────────────────
async function handleExcelUpload(mediaId, fileName) {
  const buffer = await downloadWhatsAppFile(mediaId);
  return await handleExcelUploadFromBuffer(buffer, fileName);
}

function isExcelUpload(message) {
  return isExcelFile(message);
}

module.exports = {
  handleExcelUpload,
  handleSmartExcelUpload,
  handleResultsUpload,
  isExcelUpload,
  isExcelFile,
  detectExcelType,
};