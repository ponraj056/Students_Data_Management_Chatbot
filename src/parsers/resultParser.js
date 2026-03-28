// ─────────────────────────────────────────
//  src/parsers/resultParser.js
//  VSB College Result Excel Parser
//  Format: Subject#1 Code|GR|GP, Subject#2...
// ─────────────────────────────────────────

function parseVSBResultExcel(rawRows) {
  const results = [];

  // Find header rows (Row 5 = subject headers, Row 6 = code/gr/gp)
  let subjectHeaderRow = -1;
  let dataStartRow     = -1;
  let semester         = 5;

  for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
    const row = rawRows[i].map(c => String(c).toLowerCase());
    if (row.some(c => c.includes('register number') || c.includes('regno'))) {
      subjectHeaderRow = i;
      dataStartRow     = i + 2; // skip code/gr/gp row
      break;
    }
  }

  if (subjectHeaderRow === -1) return results;

  // Extract semester from earlier rows
  for (let i = 0; i < subjectHeaderRow; i++) {
    const rowStr = rawRows[i].join(' ');
    const semMatch = rowStr.match(/SEMESTER\s*[:#]\s*(\d)/i);
    if (semMatch) { semester = parseInt(semMatch[1]); break; }
  }

  const headerRow = rawRows[subjectHeaderRow];
  const codeRow   = rawRows[subjectHeaderRow + 1]; // Code|GR|GP row

  // Build subject column map
  // headerRow: ["S.No", "Register Number", "Sem. No", "Subject #1", "", "", "Subject #2"...]
  // codeRow:   ["",     "",                "",         "Code", "GR.", "GP.", "Code", "GR."...]
  const subjectCols = []; // { subjectNum, codeIdx, gradeIdx, gpIdx }

  for (let col = 3; col < headerRow.length - 4; col++) {
    const h = String(headerRow[col]).toLowerCase();
    if (h.includes('subject')) {
      // Next 3 cols = Code, GR, GP
      subjectCols.push({ codeIdx: col, gradeIdx: col + 1, gpIdx: col + 2 });
    }
  }

  // Result col, arrears col, gpa col, cgpa col (last 4)
  const lastCols = headerRow.length;
  const resultIdx  = lastCols - 4;
  const arrearIdx  = lastCols - 3;
  const gpaIdx     = lastCols - 2;
  const cgpaIdx    = lastCols - 1;

  // Parse data rows
  for (let r = dataStartRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.every(c => c === '' || c === null)) continue;

    const rollNo = String(row[1] || '').trim();
    if (!rollNo || !/^\d{10,12}$/.test(rollNo)) continue;

    const rowSem   = parseInt(row[2]) || semester;
    const result   = String(row[resultIdx] || '').trim();
    const arrears  = String(row[arrearIdx] || '-').trim();
    const gpa      = parseFloat(row[gpaIdx])  || 0;
    const cgpa     = parseFloat(row[cgpaIdx]) || 0;

    // Each subject
    subjectCols.forEach((sc, idx) => {
      const code  = String(row[sc.codeIdx]  || '').trim();
      const grade = String(row[sc.gradeIdx] || '').trim();
      const gp    = parseFloat(row[sc.gpIdx]) || 0;

      if (!code || code === '') return;

      results.push({
        rollNo:   rollNo,
        semester: rowSem,
        subject:  code,
        grade:    grade,
        gp:       gp,
        cgpa:     cgpa,
        sgpa:     gpa,
        status:   (grade === 'U' || grade === 'RA' || grade === 'W') ? 'FAIL' : 'PASS',
        arrears:  arrears === '-' ? 0 : (parseInt(arrears) || 0),
      });
    });
  }

  return results;
}

module.exports = { parseVSBResultExcel };