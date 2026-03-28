// src/handlers/dateAttendanceHandler.js
// MongoDB version — handles 5000+ students fast
require('dotenv').config();
const { Attendance } = require('../models/Student');
const logger = require('../utils/logger');

// ── Parse date string ─────────────────────
function parseDate(str) {
  if (!str) return null;
  const months = {
    jan:0,feb:1,mar:2,apr:3,may:4,
    jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11
  };
  const m = String(str).toLowerCase().match(/(\d{1,2})[-\/]([a-z]{3})/);
  if (m) {
    return new Date(new Date().getFullYear(), months[m[2]], parseInt(m[1]));
  }
  return new Date(str);
}

// ── Get all dates in range ────────────────
function getDatesInRange(fromStr, toStr) {
  const from  = parseDate(fromStr);
  const to    = parseDate(toStr);
  const dates = [];
  const cur   = new Date(from);

  while (cur <= to) {
    const day = String(cur.getDate()).padStart(2, '0');
    const mon = cur.toLocaleString('en', { month: 'short' });
    dates.push(`${day}-${mon}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ── Analyze attendance from MongoDB ──────
async function analyzeAttendance(options = {}) {
  const { dept, fromDate, toDate, rollNo } = options;

  logger.info(`MongoDB attendance query: ${dept} | ${fromDate} → ${toDate}`);

  // Get all dates in range
  const allDates = getDatesInRange(fromDate, toDate);

  // Build MongoDB query
  const query = { date: { $in: allDates } };
  if (dept)   query.dept   = dept.toUpperCase();
  if (rollNo) query.rollNo = rollNo.toUpperCase();

  // Fetch all records in date range
  const records = await Attendance.find(query).lean();

  if (records.length === 0) {
    logger.warn('No attendance records found in MongoDB');
    return [];
  }

  // Group by student rollNo
  const studentMap = {};
  records.forEach(rec => {
    if (!studentMap[rec.rollNo]) {
      studentMap[rec.rollNo] = {
        rollNo:      rec.rollNo,
        name:        rec.name || '',
        dept:        rec.dept || dept || '',
        present:     0,
        absent:      0,
        absentDates: [],
      };
    }

    const val = String(rec.status || '').toUpperCase();
    if (val === 'P') {
      studentMap[rec.rollNo].present++;
    } else if (val === 'A' || val === 'L') {
      studentMap[rec.rollNo].absent++;
      studentMap[rec.rollNo].absentDates.push(rec.date);
    }
  });

  // Calculate percentage for each student
  const results = Object.values(studentMap).map(s => {
    const totalDays  = s.present + s.absent;
    const percentage = totalDays > 0
      ? parseFloat(((s.present / totalDays) * 100).toFixed(1))
      : 0;

    return {
      ...s,
      totalDays,
      percentage,
      status:
        percentage >= 90 ? '🟢 Excellent'     :
        percentage >= 75 ? '🟡 Satisfactory'  :
        percentage >= 65 ? '🟠 Warning'       :
                           '🔴 Detained Risk',
    };
  });

  // Sort: worst first
  results.sort((a, b) => a.percentage - b.percentage);

  logger.success(`Attendance analyzed: ${results.length} students`);
  return results;
}

// ── Format as WhatsApp Text ───────────────
function formatAsText(results, options = {}) {
  const { fromDate, toDate, dept } = options;

  if (results.length === 0) {
    return `❌ No attendance data found for *${dept}*\n` +
           `📅 ${fromDate} → ${toDate}\n\n` +
           `Please upload the attendance Excel first.`;
  }

  const total    = results.length;
  const detained = results.filter(s => s.percentage < 65).length;
  const warning  = results.filter(s => s.percentage >= 65 && s.percentage < 75).length;
  const good     = results.filter(s => s.percentage >= 75).length;
  const avgPct   = (results.reduce((a,b) => a + b.percentage, 0) / total).toFixed(1);

  let msg = '';
  msg += `📋 *Attendance Report*\n`;
  msg += `🏢 Dept: *${dept || 'All'}*\n`;
  msg += `📅 ${fromDate} → ${toDate}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👥 Total Students  : ${total}\n`;
  msg += `📊 Dept Average    : ${avgPct}%\n`;
  msg += `🟢 Above 75%       : ${good}\n`;
  msg += `🟠 Warning (65-75%): ${warning}\n`;
  msg += `🔴 Detained Risk   : ${detained}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (detained > 0) {
    msg += `\n🔴 *DETAINED RISK (below 65%):*\n`;
    results
      .filter(s => s.percentage < 65)
      .slice(0, 15) // WhatsApp message limit
      .forEach(s => {
        msg += `• ${s.rollNo} — ${s.name}\n`;
        msg += `  Leave: *${s.absent} days* | *${s.percentage}%*\n`;
      });
    if (detained > 15) msg += `  _...and ${detained - 15} more_\n`;
  }

  if (warning > 0) {
    msg += `\n🟠 *WARNING (65–75%):*\n`;
    results
      .filter(s => s.percentage >= 65 && s.percentage < 75)
      .slice(0, 10)
      .forEach(s => {
        msg += `• ${s.rollNo} — ${s.name}\n`;
        msg += `  Leave: *${s.absent} days* | *${s.percentage}%*\n`;
      });
  }

  msg += `\n_Reply "PDF" or "Excel" for full report_`;
  return msg;
}

module.exports = { analyzeAttendance, formatAsText };