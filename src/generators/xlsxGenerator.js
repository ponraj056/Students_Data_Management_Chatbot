// ─────────────────────────────────────────
//  src/generators/xlsxGenerator.js
//  Student data Excel report generator
//  Uses ExcelJS for styled multi-sheet output
// ─────────────────────────────────────────
const ExcelJS = require('exceljs');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const { getDeptName } = require('../utils/deptMapper');

const OUTPUT_DIR = process.env.OUTPUT_DIR || './outputs';
const COLLEGE_NAME = process.env.COLLEGE_NAME || 'College of Engineering';

// ── Shared styles ─────────────────────────
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const AT_RISK_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF8A80' } };
const ALT_ROW_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
const BORDER = {
  top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
  left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
  bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
  right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
};

function applyHeaderRow(sheet, columns) {
  sheet.columns = columns;
  const headerRow = sheet.getRow(1);
  headerRow.fill = HEADER_FILL;
  headerRow.font = HEADER_FONT;
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 24;
  headerRow.eachCell(cell => { cell.border = BORDER; });
}

function styleDataRow(row, isAtRisk = false, altRow = false) {
  if (isAtRisk) {
    row.fill = AT_RISK_FILL;
    row.font = { bold: true, color: { argb: 'FFB71C1C' } };
  } else if (altRow) {
    row.fill = ALT_ROW_FILL;
  }
  row.eachCell(cell => { cell.border = BORDER; });
  row.alignment = { vertical: 'middle' };
}

// ── Parse chunks into record groups ──────
function extractRecordsByType(chunks, recordType) {
  return chunks.filter(c => c.metadata?.recordType === recordType);
}

function parseChunkText(text) {
  // Parse "Key:Value Key:Value ..." format
  const pairs = {};
  const matches = text.matchAll(/(\w+):([^\s]+(?:\s+[^\s:]+)*?)(?=\s+\w+:|$)/g);
  for (const m of matches) {
    pairs[m[1].toLowerCase()] = m[2].trim();
  }
  return pairs;
}

// ── Generate student report Excel ─────────
async function generateStudentExcel(chunks, dept, reportType = 'full', meta = {}) {
  const filename = `student_report_${dept}_${Date.now()}.xlsx`;
  const filePath = path.join(OUTPUT_DIR, filename);
  await fs.ensureDir(OUTPUT_DIR);

  const wb = new ExcelJS.Workbook();
  const deptName = getDeptName(dept);
  const genDate = new Date().toLocaleDateString('en-IN');

  wb.creator = COLLEGE_NAME;
  wb.created = new Date();
  wb.modified = new Date();

  // ── Sheet 1: Student Master ───────────────
  const masterChunks = extractRecordsByType(chunks, 'master');
  if (masterChunks.length > 0) {
    const ws = wb.addWorksheet('Student Master', { properties: { tabColor: { argb: 'FF1A237E' } } });

    // College header merged row
    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = `${COLLEGE_NAME} — ${deptName} Student Data`;
    ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF1A237E' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 22;

    ws.mergeCells('A2:H2');
    ws.getCell('A2').value = `Generated: ${genDate}  |  Dept: ${dept}  |  Students: ${masterChunks.length}`;
    ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF616161' } };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.addRow([]); // spacer

    applyHeaderRow(ws, [
      { header: 'Roll No', key: 'rollno', width: 14 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Dept', key: 'dept', width: 12 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Section', key: 'section', width: 10 },
      { header: 'DOB', key: 'dob', width: 14 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone', width: 14 },
    ]);

    masterChunks.forEach((c, i) => {
      const p = parseChunkText(c.text);
      const row = ws.addRow({
        rollno: p.roll || p.regno || '',
        name: p.name || '',
        dept: p.dept || dept,
        year: p.year || '',
        section: p.section || '',
        dob: p.dob || '',
        email: p.email || '',
        phone: p.phone || '',
      });
      styleDataRow(row, false, i % 2 === 1);
      row.getCell('rollno').font = { bold: true };
    });
  }

  // ── Sheet 2: Attendance ───────────────────
  const attChunks = extractRecordsByType(chunks, 'attendance');
  if (attChunks.length > 0) {
    const ws = wb.addWorksheet('Attendance', { properties: { tabColor: { argb: 'FF2E7D32' } } });

    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = `${dept} — Attendance Report  |  ${genDate}`;
    ws.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF2E7D32' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.addRow([]);

    applyHeaderRow(ws, [
      { header: 'Roll No', key: 'rollno', width: 14 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Subject', key: 'subject', width: 22 },
      { header: 'Total Classes', key: 'total', width: 14 },
      { header: 'Attended', key: 'attended', width: 12 },
      { header: 'Percentage', key: 'pct', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
    ]);

    attChunks.forEach((c, i) => {
      const p = parseChunkText(c.text);
      const pct = parseFloat(p.attendancepct || p.percentage || '0');
      const isAtRisk = pct > 0 && pct < 75;
      const row = ws.addRow({
        rollno: p.roll || '',
        name: p.name || '',
        subject: p.subject || '',
        total: p.totalclasses || '',
        attended: p.attended || '',
        pct: p.attendancepct ? `${p.attendancepct}%` : '',
        status: isAtRisk ? '⚠️ AT-RISK' : (pct >= 90 ? '✅ Good' : '🟡 OK'),
      });
      styleDataRow(row, isAtRisk, !isAtRisk && i % 2 === 1);
    });
  }

  // ── Sheet 3: Results ──────────────────────
  const resChunks = extractRecordsByType(chunks, 'results');
  if (resChunks.length > 0) {
    const ws = wb.addWorksheet('Exam Results', { properties: { tabColor: { argb: 'FFE53935' } } });

    ws.mergeCells('A1:J1');
    ws.getCell('A1').value = `${dept} — Exam Results  |  ${genDate}`;
    ws.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFB71C1C' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.addRow([]);

    applyHeaderRow(ws, [
      { header: 'Roll No', key: 'rollno', width: 14 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Semester', key: 'semester', width: 10 },
      { header: 'Subject', key: 'subject', width: 22 },
      { header: 'Internal', key: 'internal', width: 10 },
      { header: 'External', key: 'external', width: 10 },
      { header: 'Total', key: 'total', width: 10 },
      { header: 'Grade', key: 'grade', width: 10 },
      { header: 'CGPA', key: 'cgpa', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
    ]);

    resChunks.forEach((c, i) => {
      const p = parseChunkText(c.text);
      const fail = (p.result || p.status || '').toLowerCase() === 'fail';
      const row = ws.addRow({
        rollno: p.roll || '',
        name: p.name || '',
        semester: p.semester || '',
        subject: p.subject || '',
        internal: p.internal || '',
        external: p.external || '',
        total: p.total || '',
        grade: p.grade || '',
        cgpa: p.cgpa || '',
        status: p.result || p.status || 'PASS',
      });
      styleDataRow(row, fail, !fail && i % 2 === 1);
    });
  }

  // ── Summary Sheet ─────────────────────────
  const summaryWs = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FFFF6F00' } } });
  summaryWs.getColumn('A').width = 30;
  summaryWs.getColumn('B').width = 20;

  const summaryData = [
    ['REPORT SUMMARY', ''],
    ['College', COLLEGE_NAME],
    ['Department', `${dept} — ${deptName}`],
    ['Generated On', genDate],
    ['Generated By', meta.requestedBy || 'Staff'],
    ['Total Master Records', masterChunks.length],
    ['Total Attendance Records', attChunks.length],
    ['Total Result Records', resChunks.length],
  ];

  summaryData.forEach((row, i) => {
    const r = summaryWs.addRow(row);
    if (i === 0) {
      r.font = { bold: true, size: 14, color: { argb: 'FF1A237E' } };
      r.height = 24;
    } else if (i <= 4) {
      r.font = { bold: true };
      r.getCell('B').font = { color: { argb: 'FF283593' } };
    }
  });

  await wb.xlsx.writeFile(filePath);
  logger.success(`Excel report generated: ${filename}`);
  return filePath;
}

// ── Legacy wrapper ────────────────────────
async function generateXLSX(query, answer, chunks, timestamp) {
  const dept = chunks[0]?.metadata?.dept || 'GENERAL';
  return generateStudentExcel(chunks, dept, 'full', {});
}

module.exports = { generateStudentExcel, generateXLSX };
