// ─────────────────────────────────────────
//  src/parsers/zipParser.js
//  Unzips archive and parses every file inside
// ─────────────────────────────────────────
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('../utils/logger');

// Supported file extensions inside ZIP
const SUPPORTED = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.txt', '.csv', '.png', '.jpg', '.jpeg'];

async function parseZIP(filePath) {
  try {
    logger.info(`Parsing ZIP: ${filePath}`);

    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    logger.info(`ZIP contains ${entries.length} files`);

    // Create a temporary folder to extract files into
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ragzip_'));

    let allText = '';
    let parsedCount = 0;
    let skippedCount = 0;

    for (const entry of entries) {
      // Skip folders — we only want files
      if (entry.isDirectory) continue;

      const entryName = entry.entryName;
      const ext = path.extname(entryName).toLowerCase();

      // Skip unsupported file types
      if (!SUPPORTED.includes(ext)) {
        logger.warn(`Skipping unsupported file: ${entryName}`);
        skippedCount++;
        continue;
      }

      // Skip hidden files (start with .)
      if (path.basename(entryName).startsWith('.')) continue;

      try {
        // Extract this single file to temp folder
        const tmpPath = path.join(tmpDir, path.basename(entryName));
        fs.writeFileSync(tmpPath, entry.getData());

        // Import parser dynamically to avoid circular dependency
        const { parseFileByType } = require('./index');
        const text = await parseFileByType(tmpPath, '');

        allText += `\n=== File: ${entryName} ===\n${text}\n`;
        parsedCount++;

        logger.success(`Parsed from ZIP: ${entryName}`);

        // Clean up temp file immediately
        fs.unlinkSync(tmpPath);

      } catch (err) {
        logger.warn(`Could not parse ${entryName}: ${err.message}`);
        skippedCount++;
      }
    }

    // Clean up temp folder
    fs.rmdirSync(tmpDir, { recursive: true });

    logger.success(`ZIP done! Parsed: ${parsedCount} files | Skipped: ${skippedCount} files`);

    return allText;

  } catch (err) {
    logger.error('ZIP parsing failed:', err.message);
    throw err;
  }
}

module.exports = { parseZIP };