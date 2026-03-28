/**
 * Statistics Handler - Pass/Fail Calculations
 * Location: src/handlers/statisticsHandler.js
 */

const getPassFailStats = (students) => {
  if (!students || students.length === 0) {
    return null;
  }

  let passCount = 0;
  let failCount = 0;
  const totalCount = students.length;

  // Calculate pass/fail based on CGPA >= 5.0
  students.forEach(student => {
    const cgpa = parseFloat(student.cgpa) || 0;
    
    if (cgpa >= 5.0) {
      passCount++;
    } else {
      failCount++;
    }
  });

  const passPercentage = ((passCount / totalCount) * 100).toFixed(2);
  const failPercentage = ((failCount / totalCount) * 100).toFixed(2);

  return {
    totalStudents: totalCount,
    passCount: passCount,
    failCount: failCount,
    passPercentage: parseFloat(passPercentage),
    failPercentage: parseFloat(failPercentage)
  };
};

const formatPassFailStats = (stats) => {
  if (!stats) {
    return "❌ No student data available for statistics";
  }

  const message = `
📊 *PASS/FAIL STATISTICS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👥 *Total Students:* ${stats.totalStudents}

✅ *PASSED:*
   Students: ${stats.passCount}
   Percentage: ${stats.passPercentage}%

❌ *FAILED:*
   Students: ${stats.failCount}
   Percentage: ${stats.failPercentage}%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 *Pass Rate:* ${stats.passPercentage}%
📉 *Fail Rate:* ${stats.failPercentage}%

Type "menu" to go back.
  `;

  return message;
};

/**
 * Get statistics by department
 */
const getPassFailByDepartment = (students) => {
  const departments = {};

  students.forEach(student => {
    const dept = student.department || "Unknown";
    
    if (!departments[dept]) {
      departments[dept] = {
        total: 0,
        pass: 0,
        fail: 0
      };
    }

    departments[dept].total++;
    
    const cgpa = parseFloat(student.cgpa) || 0;
    if (cgpa >= 5.0) {
      departments[dept].pass++;
    } else {
      departments[dept].fail++;
    }
  });

  return departments;
};

const formatDepartmentStats = (departments) => {
  let message = `📊 *PASS/FAIL BY DEPARTMENT*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const [dept, stats] of Object.entries(departments)) {
    const passPercentage = ((stats.pass / stats.total) * 100).toFixed(2);
    const failPercentage = ((stats.fail / stats.total) * 100).toFixed(2);
    
    message += `*${dept}*\n`;
    message += `  Total: ${stats.total}\n`;
    message += `  Pass: ${stats.pass} (${passPercentage}%)\n`;
    message += `  Fail: ${stats.fail} (${failPercentage}%)\n\n`;
  }

  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nType "menu" to exit`;
  
  return message;
};

/**
 * Get statistics by semester
 */
const getPassFailBySemester = (students, semester) => {
  const filtered = students.filter(s => s.semester == semester);
  return getPassFailStats(filtered);
};

module.exports = {
  getPassFailStats,
  formatPassFailStats,
  getPassFailByDepartment,
  formatDepartmentStats,
  getPassFailBySemester
};