// ─────────────────────────────────────────
//  src/parsers/docxParser.js
//  Extracts all text from Word .docx files
// ─────────────────────────────────────────
const mammoth = require('mammoth');
const logger = require('../utils/logger');

async function parseDOCX(filePath) {
  try {
    logger.info(`Parsing DOCX: ${filePath}`);

    // Extract raw text from the Word document
    const result = await mammoth.extractRawText({ path: filePath });

    // Warn if mammoth found any issues inside the file
    if (result.messages.length > 0) {
      result.messages.forEach(msg => logger.warn(`DOCX warning: ${msg.message}`));
    }

    logger.success(`DOCX parsed! Characters: ${result.value.length}`);

    return result.value;

  } catch (err) {
    logger.error('DOCX parsing failed:', err.message);
    throw err;
  }
}

module.exports = { parseDOCX };