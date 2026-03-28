// ─────────────────────────────────────────
//  src/whatsapp/menuHandler.js
//  College-specific menu system
//  Main menu / report type / format selection
// ─────────────────────────────────────────
const { sendListMessage, sendTextMessage, sendButtonMessage } = require('./sender');

const COLLEGE_NAME = process.env.COLLEGE_NAME || 'College Student Management';

// ── Main menu (role-aware) ────────────────
async function sendMainMenu(to, user) {
  const role = user.role;
  const dept = user.department;

  const commonRows = [
    { id: 'menu_search', title: '🔍 Search Student', description: 'Find by name or roll number' },
    { id: 'menu_attendance', title: '📋 Attendance', description: 'View attendance records' },
    { id: 'menu_results', title: '📝 Results', description: 'Exam results & grades' },
  ];

  const uploadRow = { id: 'menu_upload', title: '📤 Upload Data', description: 'Upload student Excel file' };
  const reportRow = { id: 'menu_reports', title: '📊 Reports', description: 'Generate department reports' };
  const updateRow = { id: 'menu_update', title: '✏️ Update Records', description: 'Add or modify student data' };

  let sections;

  if (role === 'ADMIN') {
    sections = [{
      title: '🎓 Admin Functions',
      rows: [uploadRow, reportRow, ...commonRows, updateRow],
    }];
  } else if (role === 'HOD') {
    sections = [{
      title: `🎓 HOD — ${dept}`,
      rows: [reportRow, ...commonRows],
    }];
  } else {
    // FACULTY
    sections = [{
      title: `👨‍🏫 Faculty — ${dept}`,
      rows: [uploadRow, ...commonRows, updateRow],
    }];
  }

  await sendListMessage(
    to,
    `🎓 ${COLLEGE_NAME}`,
    `Welcome, *${user.name}*!\n🏢 Role: ${user.role} | Dept: ${dept}\n\nWhat would you like to do?`,
    'Choose Action',
    sections
  );
}

// ── Report type menu ──────────────────────
async function sendReportTypeMenu(to, user) {
  const rows = [
    { id: 'report_full', title: '📊 Full Department Report', description: 'Complete department overview' },
    { id: 'report_attendance', title: '📋 Attendance Summary', description: 'Attendance analysis & at-risk' },
    { id: 'report_results', title: '📝 Results Analysis', description: 'Marks, grades & CGPA stats' },
    { id: 'report_atrisk', title: '⚠️ At-Risk Students', description: 'Low attendance & CGPA alerts' },
    { id: 'report_toppers', title: '🏆 Toppers List', description: 'Top performers by CGPA' },
  ];

  await sendListMessage(
    to,
    '📊 Select Report Type',
    `Choose the type of report for *${user.department}* department:`,
    'Select Report',
    [{ title: 'Report Types', rows }]
  );
}

// ── Department selection menu (Admin only) ──
async function sendDeptSelectionMenu(to) {
  const ugDepts = ['AIDS', 'AIML', 'BIO-MED', 'BIO-TECH', 'CSBS', 'CSE', 'CIVIL', 'CHEMICAL', 'CCE', 'ECE'];
  const ugDepts2 = ['EEE', 'IT', 'MECH'];
  const pgDepts = ['ME', 'MCA', 'MBA'];

  const sections = [
    {
      title: '🎓 UG Departments (1)',
      rows: ugDepts.map(d => ({ id: `dept_${d}`, title: d, description: deptShortName(d) })),
    },
    {
      title: '🎓 UG Departments (2)',
      rows: ugDepts2.map(d => ({ id: `dept_${d}`, title: d, description: deptShortName(d) })),
    },
    {
      title: '🎓 PG Courses',
      rows: pgDepts.map(d => ({ id: `dept_${d}`, title: d, description: deptShortName(d) })),
    },
  ];

  await sendListMessage(
    to,
    '🏢 Select Department',
    'As Admin, choose the department for this report:',
    'Select Dept',
    sections
  );
}

// ── Format selection menu ─────────────────
async function sendFormatMenu(to, reportType = 'report') {
  const sections = [
    {
      title: '📄 Documents',
      rows: [
        { id: 'format_pdf', title: '📄 PDF Report', description: 'Formatted, printable report' },
        { id: 'format_excel', title: '📊 Excel Sheet', description: 'Editable spreadsheet with data' },
        { id: 'format_zip', title: '🗜️ Full Bundle', description: 'PDF + Excel combined ZIP' },
      ],
    },
    {
      title: '💬 Quick View',
      rows: [
        { id: 'format_text', title: '💬 WhatsApp Text', description: 'Instant summary in chat' },
      ],
    },
  ];

  await sendListMessage(
    to,
    '📊 Choose Format',
    `How would you like to receive your *${reportType}*?`,
    'Select Format',
    sections
  );
}

// ── Search prompt ─────────────────────────
async function promptForSearch(to) {
  await sendTextMessage(to,
    `🔍 *Search Student*\n\n` +
    `Please enter the student's:\n` +
    `• Roll Number (e.g., *22CS045*)\n` +
    `• OR Student Name (e.g., *Rahul Kumar*)\n\n` +
    `Type and send now 👇`
  );
}

// ── Dept short name helper ────────────────
function deptShortName(code) {
  const map = {
    'AIDS': 'AI & Data Science', 'AIML': 'AI & Machine Learning',
    'BIO-MED': 'Bio-Medical Engg', 'BIO-TECH': 'Bio-Technology',
    'CSBS': 'CS & Business Systems', 'CSE': 'Computer Science',
    'CIVIL': 'Civil Engineering', 'CHEMICAL': 'Chemical Engineering',
    'CCE': 'Computer & Comm Engg', 'ECE': 'Electronics & Communication',
    'EEE': 'Electrical Engineering', 'IT': 'Information Technology',
    'MECH': 'Mechanical Engineering', 'ME': 'M.E / M.Tech'
  };
  return map[code] || code;
}

module.exports = {
  sendMainMenu,
  sendReportTypeMenu,
  sendDeptSelectionMenu,
  sendFormatMenu,
  promptForSearch,
};
