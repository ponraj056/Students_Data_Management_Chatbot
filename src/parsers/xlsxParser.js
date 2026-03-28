// ─────────────────────────────────────────
//  src/parsers/xlsxParser.js
//  Extracts all data from Excel .xlsx files
// ─────────────────────────────────────────
const XLSX = require('xlsx');
const logger = require('../utils/logger');

async function parseXLSX(filePath) {
  try {
    logger.info(`Parsing XLSX: ${filePath}`);

    // Read the Excel workbook from disk
    const workbook = XLSX.readFile(filePath);

    let allText = '';
    let totalRows = 0;

    // Loop through every sheet in the workbook
    workbook.SheetNames.forEach(sheetName => {
      logger.info(`Reading sheet: ${sheetName}`);

      const sheet = workbook.Sheets[sheetName];

      // Convert sheet to array of rows
      // header:1 means first row is treated as data not header
      // defval:'' means empty cells become empty string
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
      });

      allText += `\n=== Sheet: ${sheetName} ===\n`;

      rows.forEach((row, rowIndex) => {
        // Convert every cell to string and join with |
        const rowText = row
          .map(cell => String(cell).trim())
          .filter(cell => cell !== '')
          .join(' | ');

        // Only add rows that have actual content
        if (rowText.trim()) {
          allText += `Row ${rowIndex + 1}: ${rowText}\n`;
          totalRows++;
        }
      });
    });

    logger.success(`XLSX parsed! Sheets: ${workbook.SheetNames.length} | Rows: ${totalRows}`);

    return allText;

  } catch (err) {
    logger.error('XLSX parsing failed:', err.message);
    throw err;
  }
}

module.exports = { parseXLSX };