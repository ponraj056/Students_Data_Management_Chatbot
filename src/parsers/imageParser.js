// ─────────────────────────────────────────
//  src/parsers/imageParser.js
//  Extracts text from images using OCR
//  Supports: JPG, PNG, BMP, TIFF, GIF
// ─────────────────────────────────────────
const Tesseract = require('tesseract.js');
const logger = require('../utils/logger');

async function parseImage(filePath) {
  try {
    logger.info(`Running OCR on image: ${filePath}`);
    logger.info('This may take 10-30 seconds for first run...');

    const { data } = await Tesseract.recognize(
      filePath,
      'eng', // Language: English
      {
        logger: m => {
          // Show OCR progress in terminal
          if (m.status === 'recognizing text') {
            process.stdout.write(
              `\r🔍 OCR Progress: ${Math.round(m.progress * 100)}%`
            );
          }
        },
      }
    );

    // Move to next line after progress bar
    process.stdout.write('\n');

    logger.success(`Image OCR done! Characters: ${data.text.length}`);

    return data.text;

  } catch (err) {
    logger.error('Image OCR failed:', err.message);
    throw err;
  }
}

module.exports = { parseImage };