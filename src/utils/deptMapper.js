// ─────────────────────────────────────────
//  src/utils/deptMapper.js
//  Maps department codes ↔ full names
//  Used throughout the system for display
// ─────────────────────────────────────────

const DEPARTMENTS = {
    'AIDS': 'Artificial Intelligence & Data Science',
    'AIML': 'Artificial Intelligence & Machine Learning',
    'BIO-MED': 'Bio-Medical Engineering',
    'BIO-TECH': 'Bio-Technology',
    'CSBS': 'Computer Science & Business Systems',
    'CSE': 'Computer Science & Engineering',
    'CIVIL': 'Civil Engineering',
    'CHEMICAL': 'Chemical Engineering',
    'CCE': 'Computer & Communication Engineering',
    'ECE': 'Electronics & Communication Engineering',
    'EEE': 'Electrical & Electronics Engineering',
    'IT': 'Information Technology',
    'MECH': 'Mechanical Engineering',
    // PG
    'ME': 'Master of Engineering / M.Tech',
    'MCA': 'Master of Computer Applications',
    'MBA': 'Master of Business Administration',
};

// Reverse map: full name → code
const NAME_TO_CODE = Object.fromEntries(
    Object.entries(DEPARTMENTS).map(([code, name]) => [name.toLowerCase(), code])
);

// ── Get full name from code ───────────────
function getDeptName(code) {
    return DEPARTMENTS[code?.toUpperCase()] || code;
}

// ── Get code from full name ───────────────
function getDeptCode(name) {
    if (!name) return null;
    const upper = name.toUpperCase();
    if (DEPARTMENTS[upper]) return upper;
    return NAME_TO_CODE[name.toLowerCase()] || null;
}

// ── Validate a dept code ──────────────────
function isValidDept(code) {
    if (!code) return false;
    return Object.prototype.hasOwnProperty.call(DEPARTMENTS, code.toUpperCase());
}

// ── Get all UG department codes ───────────
function getUGDepts() {
    return ['AIDS', 'AIML', 'BIO-MED', 'BIO-TECH', 'CSBS', 'CSE', 'CIVIL', 'CHEMICAL', 'CCE', 'ECE', 'EEE', 'IT', 'MECH'];
}

// ── Get all PG department codes ───────────
function getPGDepts() {
    return ['ME', 'MCA', 'MBA'];
}

// ── Get all department codes ──────────────
function getAllDepts() {
    return Object.keys(DEPARTMENTS);
}

// ── Try to extract dept from Excel filename ──
// Supports any position in filename:
// "IT_students_2024.xlsx"      → IT
// "04-03-26 IT REPORT.xlsx"    → IT
// "CSE_result_2024.xlsx"       → CSE
// "report_ECE_march.xlsx"      → ECE
function deptFromFilename(filename) {
    if (!filename) return null;
    const base = filename.split('.')[0].toUpperCase();

    // Sort by length descending to match longer codes first
    // e.g. match "AIML" before "AI", "CSE" before "CE"
    const sortedDepts = getAllDepts().sort((a, b) => b.length - a.length);

    for (const code of sortedDepts) {
        // Match whole word using word boundaries
        const regex = new RegExp('\\b' + code.replace('-', '[-\\s]?') + '\\b', 'i');
        if (regex.test(base)) return code;
    }
    return null;
}

// ── Format dept display ───────────────────
function formatDept(code) {
    const name = getDeptName(code);
    return `${code} — ${name}`;
}

module.exports = {
    getDeptName,
    getDeptCode,
    isValidDept,
    getUGDepts,
    getPGDepts,
    getAllDepts,
    deptFromFilename,
    formatDept,
    DEPARTMENTS,
};