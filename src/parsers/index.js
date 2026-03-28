// ─────────────────────────────────────────
//  src/parsers/index.js
//  Auto-detects file type → correct parser
// ─────────────────────────────────────────
const path = require('path');
const { parsePDF } = require('./pdfParser');
const { parseDOCX } = require('./docxParser');
const { parseStudentExcel } = require('./excelParser');
const { parseXLSX } = require('./xlsxParser'); // kept for non-student xlsx files
const { parseImage } = require('./imageParser');
const { parseZIP } = require('./zipParser');
const { parseText } = require('./textParser');
const logger = require('../utils/logger');
const { handleStudentDetails, resetSession } = require('./studentDetails');


async function parseFileByType(filePath, mimeType = '') {
  const ext = path.extname(filePath).toLowerCase();

  logger.info(`Routing file: ${path.basename(filePath)} [ext: ${ext}]`);

  // ── PDF ──────────────────────────────────
  if (mimeType.includes('pdf') || ext === '.pdf') {
    return await parsePDF(filePath);
  }

  // ── Word Document ────────────────────────
  if (
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('msword') ||
    ext === '.docx' || ext === '.doc'
  ) {
    return await parseDOCX(filePath);
  }

  // ── Excel Spreadsheet ────────────────────
  if (
    mimeType.includes('spreadsheetml') ||
    mimeType.includes('excel') ||
    ext === '.xlsx' || ext === '.xls'
  ) {
    return await parseXLSX(filePath);
  }

  // ── Images ───────────────────────────────
  if (
    mimeType.includes('image/') ||
    ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.gif'].includes(ext)
  ) {
    return await parseImage(filePath);
  }

  // ── ZIP Archive ──────────────────────────
  if (mimeType.includes('zip') || ext === '.zip') {
    return await parseZIP(filePath);
  }

  // ── Plain Text / CSV / JSON ──────────────
  if (
    mimeType.includes('text/') ||
    mimeType.includes('csv') ||
    ['.txt', '.csv', '.md', '.json', '.xml'].includes(ext)
  ) {
    return await parseText(filePath, ext);
  }

  throw new Error(`Unsupported file type: ${ext || mimeType}`);
}

module.exports = { parseFileByType };