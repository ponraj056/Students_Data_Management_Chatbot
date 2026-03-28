// src/handlers/searchHandler.js
// FIXED: Alignment + photo + section from shared studentModel

const path = require('path');
const fs   = require('fs');
const { sendTextMessage, sendButtonMessage, sendListMessage } = require('../whatsapp/sender');
const { getDeptModels }  = require('../models/deptModels');
const { setStage, getSession, STAGES } = require('../whatsapp/sessionManager');
const logger  = require('../utils/logger');
const Student = require('../models/studentModel'); // ← shared model

const YEAR_LABELS = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };
const PHOTOS_DIR  = path.join(process.cwd(), 'photos');

// ─── Helpers ──────────────────────────────────────────────────────
const EMPTY = ['nil', 'nill', 'null', 'undefined', 'n/a', '', 'none', 'no'];
const val = (v) => {
  if (v === null || v === undefined) return 'N/A';
  const s = v.toString().trim();
  if (s === '' || EMPTY.includes(s.toLowerCase())) return 'N/A';
  return s;
};

const short = (v, max = 32) => {
  const s = val(v);
  if (s === 'N/A') return s;
  return s.length > max ? s.substring(0, max - 2) + '..' : s;
};

const fixPercent = (v) => {
  if (!v) return 'N/A';
  const s = v.toString().trim().toUpperCase();
  if (s === 'ALL PASS') return 'ALL PASS';
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  if (n > 0 && n < 2) return `${(n * 100).toFixed(1)}%`;
  return `${n}%`;
};

const fixIncome = (v) => {
  if (!v) return 'N/A';
  const n = parseFloat(v.toString().replace(/\s+/g, ''));
  return isNaN(n) ? v.toString() : `Rs.${n.toLocaleString('en-IN')}/year`;
};

const row = (label, value) => {
  const padded = label.padEnd(14, ' ');
  return `▪ ${padded}: ${value}`;
};

// ─── Update hint ──────────────────────────────────────────────────
function updateHint(regNo) {
  return `✏️ *To update any field:*\n\`Update_${regNo}_FieldName into NewValue\`\n\n*Examples:*\n▪ \`Update_${regNo}_Section into B\`\n▪ \`Update_${regNo}_CGPA into 8.5\`\n▪ \`Update_${regNo}_Mobile into 9876543210\``;
}

// ─── Extract Google Drive File ID ─────────────────────────────────
function getDriveFileId(photoField) {
  if (!photoField) return null;
  const str = photoField.toString().trim();
  const openMatch  = str.match(/open\?id=([-\w]+)/);
  if (openMatch)  return openMatch[1];
  const shareMatch = str.match(/\/d\/([-\w]+)/);
  if (shareMatch) return shareMatch[1];
  return null;
}

// ─── Send photo via Google Drive ──────────────────────────────────
async function sendPhotoToUser(to, fileId, caption) {
  const axios = require('axios');
  const os    = require('os');

  try {
    const urlsToTry = [
      `https://lh3.googleusercontent.com/d/${fileId}`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
      `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
    ];

    let imageBuffer = null;
    for (const url of urlsToTry) {
      try {
        const res = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 15000,
          maxRedirects: 10,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        });
        if (res.data.byteLength > 10000) { imageBuffer = res.data; break; }
      } catch (_) { continue; }
    }

    if (!imageBuffer) return false;

    const tempPath = require('path').join(os.tmpdir(), `photo_${fileId}_${Date.now()}.jpg`);
    require('fs').writeFileSync(tempPath, imageBuffer);
    const { sendImage } = require('../whatsapp/sender');
    await sendImage(to, tempPath, caption);
    try { require('fs').unlinkSync(tempPath); } catch (_) {}
    return true;
  } catch (err) {
    logger.warn('Drive photo failed: ' + err.message);
    return false;
  }
}

// ─── Format full student card ─────────────────────────────────────
function formatCard(full, attText) {
  const dob = full.dob ? new Date(full.dob).toLocaleDateString('en-IN') : 'N/A';

  return `━━━━━━━━━━━━━━━━━━━━━━━
🎓 *STUDENT PROFILE*
━━━━━━━━━━━━━━━━━━━━━━━

👤 *PERSONAL*
${row('Name',        '*' + val(full.name) + '*')}
${row('Reg No',      val(full.registerNumber))}
${row('Gender',      val(full.gender))}
${row('DOB',         dob)}
${row('Blood Grp',   val(full.bloodGroup))}
${row('Community',   val(full.community))}
${row('Religion',    val(full.religion))}
${row('Aadhaar',     val(full.aadhaarNumber))}

📞 *CONTACT*
${row('Mobile',      val(full.mobileNumber))}
${row('Email',       val(full.email))}
${row('Address',     val(full.address))}
${row('Hostel',      val(full.hostelStudent))}
${row('College Bus', val(full.collegeBusUser))}

👨‍👩‍👦 *FAMILY*
${row('Father',      val(full.fatherName))}
${row('Father Occ',  val(full.fatherOccupation))}
${row('Father Mob',  val(full.fatherMobile))}
${row('Mother',      val(full.motherName))}
${row('Mother Occ',  val(full.motherOccupation))}
${row('Mother Mob',  val(full.motherMobile))}
${row('Guardian',    val(full.guardianName))}
${row('Guard Mob',   val(full.guardianMobile))}
${row('Guard Mob2',  val(full.guardianMobile2))}
${row('Siblings',    val(full.numberOfSiblings))}
${row('Income',      fixIncome(full.parentsIncome))}

🏫 *ACADEMIC*
${row('Department',  val(full.department))}
${row('Course',      val(full.course))}
${row('Batch',       val(full.batchYear))}
${row('Year',        val(full.yearOfStudy))}
${row('Section',     val(full.section))}
${row('Admission',   val(full.admissionType))}
${row('First Grad',  val(full.firstGraduate))}
${row('Cutoff',      val(full.cutoffMark))}

📝 *EDUCATION*
${row('10th School', val(full.tenthSchool))}
${row('10th %',      fixPercent(full.tenthPercentage))}
${row('12th School', val(full.twelfthSchool))}
${row('12th %',      fixPercent(full.twelfthPercentage))}
${row('12th Group',  val(full.twelfthGroup))}
${row('Diploma Clg', short(full.diplomaCollege, 32))}
${row('Diploma %',   fixPercent(full.diplomaPercentage))}

📊 *PERFORMANCE*
${row('CGPA',        val(full.cgpa))}
${row('Arrear',      val(full.arrear))}
${row('Attendance',  attText)}

💼 *PLACEMENT*
${row('Status',      val(full.placementStatus))}
${row('Companies',   val(full.numberOfCompanies))}
${row('Company',     val(full.companyName))}
${row('Package LPA', val(full.highestPackage))}
${row('Internship',  short(full.internshipDetails, 32))}

━━━━━━━━━━━━━━━━━━━━━━━`.trim();
}

// ─── Step 1: Year selection ───────────────────────────────────────
async function startSearch(from, user) {
  // ── Student role: show only their own profile ──
  if (user && user.role === 'STUDENT') {
    const self = await Student.findOne({ registerNumber: { $regex: new RegExp('^' + user.empId + '$', 'i') } }).lean();
    if (!self) {
      await sendTextMessage(from, '❌ Your profile was not found. Please contact Admin.');
      return;
    }
    await sendStudentCard(from, self);
    return;
  }

  // Admin / Faculty / HOD — normal year search
  await sendListMessage(from,
  'Search Student',
  'Select the year to search:',
  'Select Year',        // Button label
  [
    {
      title: 'Year of Study',
      rows: [
        { id: 'YEAR_1',   title: '1st Year' },
        { id: 'YEAR_2',   title: '2nd Year' },
        { id: 'YEAR_3',   title: '3rd Year' },
        { id: 'YEAR_4',   title: '4th Year' },
        { id: 'YEAR_ALL', title: 'All Years' },
      ]
    }
  ]
);
}

// ─── Step 2: Year selected → ask name ────────────────────────────
async function onYearSelected(from, yearId, user) {
  // Block students from searching other students
  if (user && user.role === 'STUDENT') {
    await sendTextMessage(from, '⛔ Students can only view their own profile.');
    return;
  }
  const session = getSession(from);
  const yearMap = { YEAR_1: 1, YEAR_2: 2, YEAR_3: 3, YEAR_4: 4, YEAR_ALL: 0 };
  const year    = yearMap[yearId];

  session.searchYear = year;
  session.searchDept = (user.role === 'ADMIN' || user.role === 'PRINCIPAL') ? null : user.department;
  setStage(from, STAGES.AWAITING_NAME_INPUT);

  const label = year === 0 ? 'All Years' : YEAR_LABELS[year];
  await sendTextMessage(from,
    `Year: ${label}\n\nType student *name* or *roll number*:\nExample: ma → MATHAN, MANOJ\nExample: 9225 → 922523205002\n\nType menu to go back.`
  );
}

// ─── Step 3: Name input → search ─────────────────────────────────
async function onNameInput(from, input, user) {
  const session = getSession(from);
  const query   = input.trim();

  if (query.length < 2) {
    await sendTextMessage(from, 'Please type at least 2 characters.');
    return;
  }

  const year = session.searchYear !== undefined ? session.searchYear : 0;
  const dept = session.searchDept || null;

  // Check if input looks like a register number (digits only or starts with digits)
  const isRegNo = /^\d+$/.test(query);

  let filter;
  if (isRegNo) {
    // Search by register number
    filter = { registerNumber: { $regex: query, $options: 'i' } };
  } else {
    // Search by name
    filter = { name: { $regex: query, $options: 'i' } };
    if (year > 0) filter.yearOfStudy = year;
    if (dept)     filter.department  = dept;
  }

  const students = await Student.find(filter).limit(10).lean();

  logger.info(`Search "${query}" (${isRegNo ? 'regNo' : 'name'}) year=${year} -> ${students.length} found`);

  if (students.length === 0) {
    await sendTextMessage(from,
      `No students found for "${query}".\nTry different letters or type menu to go back.`
    );
    return;
  }

  if (students.length === 1) {
    await sendStudentCard(from, students[0]);
    return;
  }

  // Multiple → show list
  session.searchResults = students;
  const rows = students.slice(0, 10).map((s, i) => ({
    id:          'STU_' + i,
    title:       val(s.name).substring(0, 24),
    description: `${val(s.registerNumber)} | ${val(s.department)} | Yr ${val(s.yearOfStudy)}${s.section ? ' - ' + s.section : ''}`,
  }));

  await sendListMessage(from,
    'Search Results',
    `${students.length} students found for "${query}". Select one:`,
    'View Profile',
    [{ title: 'Students', rows }]
  );
}

// ─── Step 4: Student selected ─────────────────────────────────────
async function onStudentSelected(from, stuId) {
  const session  = getSession(from);
  const idx      = parseInt(stuId.replace('STU_', ''));
  const students = session.searchResults || [];
  const s        = students[idx];
  if (!s) { await sendTextMessage(from, 'Student not found. Please search again.'); return; }
  await sendStudentCard(from, s);
}

// ─── Send full student card ───────────────────────────────────────
async function sendStudentCard(from, s) {
  // Always fetch fresh from shared model using registerNumber
  let full = s;
  try {
    const fresh = await Student.findOne({
      registerNumber: s.registerNumber
    }).lean();
    if (fresh) full = fresh;
  } catch (e) {
    logger.warn('Fresh fetch failed: ' + e.message);
  }

  // ── Attendance from deptModels ────────────────────────────────
  let attText = 'N/A';
  try {
    const dept           = full.department?.toUpperCase();
    const { Attendance } = getDeptModels(dept);
    const attRecords     = await Attendance.find({
      name: new RegExp('^' + full.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
    }).lean();
    const attTotal   = attRecords.length;
    const attPresent = attRecords.filter(r => String(r.status).toUpperCase() === 'P').length;
    if (attTotal > 0) {
      const attPct = ((attPresent / attTotal) * 100).toFixed(1);
      const status = parseFloat(attPct) >= 95 ? 'Excellent' :
                     parseFloat(attPct) >= 85 ? 'Good' :
                     parseFloat(attPct) >= 75 ? 'Average' : 'AT RISK';
      attText = `${attPresent}/${attTotal} (${attPct}%) ${status}`;
    }
  } catch (_) {}

  // ── Send photo ────────────────────────────────────────────────
  const photoUrl = full.photo;
  if (photoUrl && photoUrl.startsWith('https://res.cloudinary.com')) {
    // Cloudinary URL — send directly
    const { sendImageUrl } = require('../whatsapp/sender');
    await sendImageUrl(from, photoUrl, `📸 ${val(full.name)} | ${val(full.registerNumber)}`);
  } else if (photoUrl) {
    // Fallback: old Google Drive
    const fileId = getDriveFileId(photoUrl);
    if (fileId) {
      await sendPhotoToUser(from, fileId, `📸 ${val(full.name)} | ${val(full.registerNumber)}`);
    }
  }

  // ── Send card + update hint ───────────────────────────────────
  await sendTextMessage(from,
    formatCard(full, attText) +
    `\n\n${updateHint(val(full.registerNumber))}` +
    `\n\n📌 Type another name or type *menu* to go back.`
  );

  // ── Update Photo button ───────────────────────────────────────
  const session = getSession(from);
  session.lastViewedRegNo = val(full.registerNumber);
  session.lastViewedName  = val(full.name);
  await sendButtonMessage(from,
    '📸 Update Photo',
    `Tap below to update photo for ${val(full.name)}:`,
    [{ id: 'UPDATE_PHOTO', title: '📸 Update Photo' }]
  );
}

// ─── Fallback search ──────────────────────────────────────────────
async function searchStudent(from, query, user) {
  const session      = getSession(from);
  session.searchYear = 0;
  session.searchDept = (user.role === 'ADMIN' || user.role === 'PRINCIPAL') ? null : user.department;
  await onNameInput(from, query, user);
}

module.exports = { startSearch, onYearSelected, onNameInput, onStudentSelected, searchStudent };