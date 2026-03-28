// ─────────────────────────────────────────
//  src/parsers/pdfParser.js
//  Extracts all text from PDF files
// ─────────────────────────────────────────
const pdfParse = require('pdf-parse');
const fs = require('fs');
const logger = require('../utils/logger');

async function parsePDF(filePath) {
  try {
    logger.info(`Parsing PDF: ${filePath}`);

    // Read the PDF file as raw bytes
    const buffer = fs.readFileSync(filePath);

    // Extract all text from every page
    const data = await pdfParse(buffer);

    logger.success(`PDF parsed! Pages: ${data.numpages} | Characters: ${data.text.length}`);

    return data.text;

  } catch (err) {
    logger.error('PDF parsing failed:', err.message);
    throw err;
  }
}

module.exports = { parsePDF };