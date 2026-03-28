// ─────────────────────────────────────────
//  src/rag/chunker.js
//  Student-record-aware chunking
//  Each student record becomes one searchable chunk
//  tagged with dept + metadata
// ─────────────────────────────────────────
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE) || 500;
const OVERLAP = parseInt(process.env.CHUNK_OVERLAP) || 100;

// ── Build a text representation of a student record ──
function recordToText(record) {
  switch (record.type) {
    case 'master':
      return [
        `Roll:${record.rollNo}`,
        `Name:${record.name}`,
        `Dept:${record.department}`,
        record.year ? `Year:${record.year}` : '',
        record.section ? `Section:${record.section}` : '',
        record.dob ? `DOB:${record.dob}` : '',
        record.email ? `Email:${record.email}` : '',
        record.phone ? `Phone:${record.phone}` : '',
        record.status ? `Status:${record.status}` : '',
        record.category ? `Category:${record.category}` : '',
      ].filter(Boolean).join(' ');

    case 'attendance':
      return [
        `Roll:${record.rollNo}`,
        `Name:${record.name}`,
        `Dept:${record.department}`,
        `Subject:${record.subject}`,
        `TotalClasses:${record.totalClasses}`,
        `Attended:${record.attended}`,
        `AttendancePct:${record.percentage}%`,
        record.month ? `Month:${record.month}` : '',
      ].filter(Boolean).join(' ');

    case 'results':
      return [
        `Roll:${record.rollNo}`,
        `Name:${record.name}`,
        `Dept:${record.department}`,
        `Semester:${record.semester}`,
        `Subject:${record.subject}`,
        `Internal:${record.internal}`,
        `External:${record.external}`,
        `Total:${record.total}`,
        `Grade:${record.grade}`,
        record.cgpa ? `CGPA:${record.cgpa}` : '',
        `Result:${record.status}`,
        record.arrears ? `Arrears:${record.arrears}` : '',
      ].filter(Boolean).join(' ');

    case 'pg':
      return [
        `RegNo:${record.rollNo}`,
        `Name:${record.name}`,
        `Course:${record.course}`,
        `Specialization:${record.department}`,
        record.year ? `Year:${record.year}` : '',
        record.semester ? `Semester:${record.semester}` : '',
        record.cgpa ? `CGPA:${record.cgpa}` : '',
        `Status:${record.status}`,
      ].filter(Boolean).join(' ');

    default:
      return record.raw || JSON.stringify(record);
  }
}

// ── Chunk student records (one chunk per record) ──
function chunkStudentRecords(records, fileMeta) {
  const chunks = [];

  records.forEach((record, idx) => {
    const text = recordToText(record).trim();
    if (!text || text.length < 5) return; // skip empties

    chunks.push({
      id: uuidv4(),
      text,
      metadata: {
        ...fileMeta,
        recordType: record.type,
        rollNo: record.rollNo || '',
        studentName: record.name || '',
        dept: record.department || fileMeta.dept || '',
        chunkIndex: idx,
      },
    });
  });

  logger.success(`Chunked ${records.length} records → ${chunks.length} chunks`);
  return chunks;
}

// ── Generic text chunker (kept for non-student docs) ──
function chunkText(text, filename) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const chunks = [];
  let start = 0, index = 0;

  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    let content = clean.slice(start, end);

    if (end < clean.length) {
      const bp = Math.max(content.lastIndexOf('. '), content.lastIndexOf('\n'));
      if (bp > CHUNK_SIZE * 0.4) content = content.slice(0, bp + 1);
    }

    chunks.push({
      id: uuidv4(),
      text: content.trim(),
      metadata: { filename, chunkIndex: index, startChar: start },
    });

    const advance = content.length - OVERLAP;
    start += advance > 0 ? advance : content.length;
    index++;
  }

  logger.success(`Chunked "${filename}" → ${chunks.length} text chunks`);
  return chunks;
}

module.exports = { chunkStudentRecords, chunkText };