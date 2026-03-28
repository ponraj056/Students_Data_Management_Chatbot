// Enhanced Excel Parser with flexible column handling
const xlsx = require('xlsx');

/**
 * Parse Excel file with flexible column name matching
 * Handles different variations of column names (Student ID, student_id, StudentID, etc.)
 */
function parseExcelFile(filePath) {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Get first sheet
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      throw new Error('Excel file is empty or has no data');
    }

    // Get actual column names from the file
    const actualColumns = Object.keys(data[0]);
    console.log('Actual columns found:', actualColumns);

    // Flexible column mapping - handles variations
    const columnMapping = normalizeColumns(actualColumns);
    console.log('Normalized columns:', columnMapping);

    // Map and validate data
    const parsedData = data.map((row, index) => {
      const normalizedRow = {};
      
      // Map columns using normalized names
      for (const [key, value] of Object.entries(columnMapping)) {
        normalizedRow[key] = row[value];
      }

      return normalizedRow;
    });

    // Validate that we have the required fields
    const requiredFields = ['student_id', 'name', 'attendance'];
    validateData(parsedData, requiredFields);

    console.log('✅ Successfully parsed', parsedData.length, 'records');
    return parsedData;

  } catch (error) {
    console.error('❌ Excel parsing error:', error.message);
    throw error;
  }
}

/**
 * Normalize column names to standard format
 * Maps variations like "Student ID", "student_id", "StudentID" → "student_id"
 */
function normalizeColumns(columnNames) {
  const mapping = {};
  const lowerColumns = columnNames.map(col => col.toLowerCase().trim());

  // Define column patterns and their target names
  const patterns = {
    student_id: [
      'student id', 'student_id', 'studentid', 'roll no', 'roll number', 
      'roll_no', 'enrolment id', 'enrollment id', 'id'
    ],
    name: [
      'name', 'student name', 'student_name', 'full name', 'full_name', 
      'student_name', 'firstname'
    ],
    attendance: [
      'attendance', 'attendance %', 'attendance percentage', 'present days',
      'present_days', 'present', 'attendance_percentage'
    ],
    email: [
      'email', 'email id', 'email_id', 'student email'
    ],
    phone: [
      'phone', 'phone number', 'phone_number', 'mobile', 'mobile_number',
      'contact'
    ],
    department: [
      'department', 'dept', 'branch'
    ]
  };

  // Match each column to a standard name
  for (const targetField of Object.keys(patterns)) {
    for (let i = 0; i < lowerColumns.length; i++) {
      const columnLower = lowerColumns[i];
      const variations = patterns[targetField];
      
      if (variations.some(v => columnLower === v || columnLower.includes(v))) {
        mapping[targetField] = columnNames[i];
        break;
      }
    }
  }

  return mapping;
}

/**
 * Validate parsed data has required fields
 */
function validateData(data, requiredFields) {
  const missingFields = [];
  
  requiredFields.forEach(field => {
    const hasMissing = data.some(row => !row[field] || row[field].toString().trim() === '');
    if (hasMissing) {
      missingFields.push(field);
    }
  });

  if (missingFields.length > 0) {
    throw new Error(`Missing or empty required fields: ${missingFields.join(', ')}`);
  }
}

module.exports = { parseExcelFile, normalizeColumns };