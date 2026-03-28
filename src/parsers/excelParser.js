// ─────────────────────────────────────────
//  src/parsers/excelParser.js
//  Parses student Excel files with 4 sheets:
//  1. Student Master   2. Attendance
//  3. Exam Results     4. PG Students
//
//  Returns structured student records (not raw text)
//  Each record tagged with dept + metadata
// ─────────────────────────────────────────
const XLSX = require('xlsx');
const logger = require('../utils/logger');
const { deptFromFilename } = require('../utils/deptMapper');

// ── Sheet name aliases (flexible matching) ─
const SHEET_ALIASES = {
    master: ['student master', 'master', 'students', 'student data', 'student info', 'ug students'],
    attendance: ['attendance', 'attendance data', 'attend'],
    results: ['exam results', 'results', 'exam', 'marks', 'grades', 'semester results'],
    pg: ['pg students', 'pg', 'postgraduate', 'pg data'],
};

function detectSheetType(sheetName) {
    const lower = sheetName.toLowerCase().trim();
    for (const [type, aliases] of Object.entries(SHEET_ALIASES)) {
        if (aliases.some(a => lower.includes(a))) return type;
    }
    return 'unknown';
}

// ── Convert sheet → array of row objects ──
function sheetToRecords(sheet) {
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

// ── Normalize column name ─────────────────
// Handles variations like "Roll No", "RollNo", "roll_no"
function getCol(row, ...keys) {
    const lowerRow = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k.toLowerCase().replace(/[\s_-]/g, ''), v])
    );
    for (const key of keys) {
        const norm = key.toLowerCase().replace(/[\s_-]/g, '');
        if (lowerRow[norm] !== undefined && lowerRow[norm] !== '') {
            return String(lowerRow[norm]).trim();
        }
    }
    return '';
}

// ── Parse Student Master sheet ────────────
function parseMasterSheet(rows, dept) {
    return rows
        .filter(row => getCol(row, 'Roll No', 'RollNo', 'Roll Number', 'RegNo'))
        .map(row => ({
            type: 'master',
            rollNo: getCol(row, 'Roll No', 'RollNo', 'Roll Number', 'RegNo'),
            name: getCol(row, 'Name', 'Student Name', 'Full Name'),
            department: dept || getCol(row, 'Department', 'Dept'),
            year: getCol(row, 'Year', 'Study Year', 'Current Year'),
            section: getCol(row, 'Section', 'Sec', 'Class'),
            dob: getCol(row, 'DOB', 'Date of Birth', 'Birthday'),
            email: getCol(row, 'Email', 'Email ID', 'Mail'),
            phone: getCol(row, 'Phone', 'Mobile', 'Contact'),
            category: getCol(row, 'Category', 'Quota'),
            status: getCol(row, 'Status', 'Student Status') || 'Active',
        }));
}

// ── Parse Attendance sheet ────────────────
function parseAttendanceSheet(rows, dept) {
    return rows
        .filter(row => getCol(row, 'Roll No', 'RollNo', 'Roll Number'))
        .map(row => ({
            type: 'attendance',
            rollNo: getCol(row, 'Roll No', 'RollNo', 'Roll Number'),
            name: getCol(row, 'Name', 'Student Name'),
            department: dept || getCol(row, 'Department', 'Dept'),
            subject: getCol(row, 'Subject', 'Subject Name', 'Course'),
            totalClasses: getCol(row, 'Total Classes', 'Total', 'Total Periods'),
            attended: getCol(row, 'Attended', 'Classes Attended', 'Present'),
            percentage: getCol(row, 'Percentage', 'Attendance %', 'Attendance Percentage', '%'),
            month: getCol(row, 'Month', 'Period'),
        }));
}

// ── Parse Exam Results sheet ─────────────
function parseResultsSheet(rows, dept) {
    return rows
        .filter(row => getCol(row, 'Roll No', 'RollNo', 'Roll Number'))
        .map(row => ({
            type: 'results',
            rollNo: getCol(row, 'Roll No', 'RollNo', 'Roll Number'),
            name: getCol(row, 'Name', 'Student Name'),
            department: dept || getCol(row, 'Department', 'Dept'),
            semester: getCol(row, 'Semester', 'Sem'),
            subject: getCol(row, 'Subject', 'Subject Name', 'Course'),
            internal: getCol(row, 'Internal', 'Internal Marks', 'IA'),
            external: getCol(row, 'External', 'External Marks', 'EA', 'University'),
            total: getCol(row, 'Total', 'Total Marks'),
            grade: getCol(row, 'Grade'),
            cgpa: getCol(row, 'CGPA', 'GPA'),
            status: getCol(row, 'Status', 'Result') || 'PASS',
            arrears: getCol(row, 'Arrears', 'Backlog', 'History of Arrears'),
        }));
}

// ── Parse PG Students sheet ───────────────
function parsePGSheet(rows, dept) {
    return rows
        .filter(row => getCol(row, 'Reg No', 'RegNo', 'Registration No', 'Roll No'))
        .map(row => ({
            type: 'pg',
            rollNo: getCol(row, 'Reg No', 'RegNo', 'Registration No', 'Roll No'),
            name: getCol(row, 'Name', 'Student Name'),
            course: getCol(row, 'Course', 'Programme'),
            department: dept || getCol(row, 'Specialization', 'Dept', 'Department'),
            year: getCol(row, 'Year'),
            semester: getCol(row, 'Semester', 'Sem'),
            cgpa: getCol(row, 'CGPA', 'GPA'),
            status: getCol(row, 'Status') || 'Active',
        }));
}

// ── Main parser ───────────────────────────
async function parseStudentExcel(filePath, meta = {}) {
    logger.info(`Parsing student Excel: ${filePath}`);

    const workbook = XLSX.readFile(filePath);
    const dept = meta.dept || deptFromFilename(filePath);

    const result = {
        filename: require('path').basename(filePath),
        dept,
        uploadedBy: meta.uploadedBy || 'unknown',
        uploadDate: new Date().toISOString(),
        sheets: {},
        allRecords: [],
        summary: {},
    };

    for (const sheetName of workbook.SheetNames) {
        const sheetType = detectSheetType(sheetName);
        const rows = sheetToRecords(workbook.Sheets[sheetName]);

        logger.info(`  Sheet "${sheetName}" → type: ${sheetType} (${rows.length} rows)`);

        let records = [];
        switch (sheetType) {
            case 'master': records = parseMasterSheet(rows, dept); break;
            case 'attendance': records = parseAttendanceSheet(rows, dept); break;
            case 'results': records = parseResultsSheet(rows, dept); break;
            case 'pg': records = parsePGSheet(rows, dept); break;
            default:
                // Try generic parse — include as raw text chunks
                records = rows.map((row, i) => ({
                    type: 'generic',
                    rollNo: `ROW${i + 1}`,
                    department: dept,
                    raw: Object.values(row).filter(v => v !== '').join(' | '),
                }));
        }

        result.sheets[sheetType] = records;
        result.allRecords.push(...records);
    }

    // Summary stats
    const masterRecs = result.sheets.master || [];
    const pgRecs = result.sheets.pg || [];
    result.summary = {
        totalStudents: masterRecs.length || pgRecs.length,
        hasAttendance: (result.sheets.attendance?.length || 0) > 0,
        hasResults: (result.sheets.results?.length || 0) > 0,
        hasPG: pgRecs.length > 0,
        sheetCount: workbook.SheetNames.length,
    };

    logger.success(
        `Excel parsed: ${result.summary.totalStudents} students, ` +
        `${result.allRecords.length} total records, ` +
        `${result.summary.sheetCount} sheets`
    );

    return result;
}

module.exports = { parseStudentExcel };
