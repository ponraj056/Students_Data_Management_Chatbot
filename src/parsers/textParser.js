// parsers/textParser.js
const fs = require('fs');
const { parse } = require('csv-parse/sync');

async function parseText(filePath, ext) {
  const raw = fs.readFileSync(filePath, 'utf-8');

  if (ext === '.csv') {
    // Parse CSV into readable row text
    const records = parse(raw, { skip_empty_lines: true });
    const text = records.map((row, i) => `Row ${i + 1}: ${row.join(' | ')}`).join('\n');
    console.log(`📃 CSV parsed: ${records.length} rows`);
    return text;
  }

  if (ext === '.json') {
    // Pretty-print JSON for better LLM understanding
    try {
      const obj = JSON.parse(raw);
      return JSON.stringify(obj, null, 2);
    } catch {
      return raw;
    }
  }

  console.log(`📃 Text parsed: ${raw.length} chars`);
  return raw;
}

module.exports = { parseText };