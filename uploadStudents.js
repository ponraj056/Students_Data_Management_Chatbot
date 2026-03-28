// uploadStudents.js
// Run this ONCE to upload your Excel file to MongoDB Atlas
// Usage: node uploadStudents.js

require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');

// ─── MongoDB Schema ───────────────────────────────────────────────
const studentSchema = new mongoose.Schema({
  timestamp:             Date,
  registerNumber:        String,
  name:                  String,
  gender:                String,
  dob:                   Date,
  bloodGroup:            String,
  aadhaarNumber:         String,
  community:             String,
  religion:              String,
  photo:                 String,
  cutoffMark:            Number,
  mobileNumber:          String,
  email:                 String,
  address:               String,
  hostelStudent:         String,
  collegeBusUser:        String,
  fatherName:            String,
  fatherOccupation:      String,
  fatherMobile:          String,
  motherName:            String,
  motherOccupation:      String,
  motherMobile:          String,
  guardianName:          String,
  guardianMobile:        String,
  guardianMobile2:       String,
  numberOfSiblings:      Number,
  department:            String,
  course:                String,
  batchYear:             String,   // e.g. "2023-27"
  yearOfStudy:           Number,   // 1, 2, 3, or 4 (computed)
  section:               String,
  admissionType:         String,
  firstGraduate:         String,
  tenthSchool:           String,
  tenthPercentage:       Number,
  twelfthSchool:         String,
  twelfthPercentage:     Number,
  twelfthGroup:          String,
  diplomaCollege:        String,
  diplomaPercentage:     Number,
  arrear:                String,
  cgpa:                  Number,
  placementStatus:       String,
  numberOfCompanies:     Number,
  companyName:           String,
  highestPackage:        Number,
  internshipDetails:     String,
}, { collection: 'students' });

const Student = mongoose.model('Student', studentSchema);

// ─── Compute Year of Study from Batch Year ────────────────────────
function getYearOfStudy(batchYear) {
  if (!batchYear) return null;
  const startYear = parseInt(batchYear.toString().split('-')[0]);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12
  // Academic year starts in July; before July = same academic year
  const academicYear = currentMonth >= 7 ? currentYear : currentYear - 1;
  const year = academicYear - startYear + 1;
  if (year >= 1 && year <= 4) return year;
  return null;
}

// ─── Main Upload Function ─────────────────────────────────────────
async function uploadStudents() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');

    // Read Excel file (put the file in same folder as this script)
    const filePath = path.join(__dirname, 'Student_Database__Responses_.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    console.log(`📊 Found ${rows.length} student records in Excel`);

    // Clear existing students (optional - comment out if you want to keep old data)
    await Student.deleteMany({});
    console.log('🗑️  Cleared existing student records');

    // Map rows to schema
    const students = rows.map(row => ({
      timestamp:          row['Timestamp'] ? new Date(row['Timestamp']) : null,
      registerNumber:     row['Register Number']?.toString(),
      name:               row['Name']?.toString().trim().toUpperCase(),
      gender:             row['Gender'],
      dob:                row['DOB'] ? new Date(row['DOB']) : null,
      bloodGroup:         row['Blood_Group'],
      aadhaarNumber:      row['Aadhaar_Number']?.toString(),
      community:          row['Community'],
      religion:           row['Religion'],
      photo:              row['photo'],
      cutoffMark:         row['Cutoff_Mark'],
      mobileNumber:       row['Mobile_Number']?.toString(),
      email:              row['Email'],
      address:            row['Address_Line1'],
      hostelStudent:      row['Hostel_Student ']?.trim(),
      collegeBusUser:     row['College bus user ']?.trim(),
      fatherName:         row['Father_Name'],
      fatherOccupation:   row['Father_Occupation'],
      fatherMobile:       row['Father_Mobile_Number']?.toString(),
      motherName:         row['Mother_Name'],
      motherOccupation:   row['Mother_Occupation'],
      motherMobile:       row['Mother_Mobile_Number']?.toString(),
      guardianName:       row['Guardian_Name'],
      guardianMobile:     row['Guardian_Mobile_Number']?.toString(),
      guardianMobile2:    row['Guardian_Mobile_Number 2']?.toString(),
      numberOfSiblings:   row['Number of sibilings'],
      department:         row['Department']?.toString().trim().toUpperCase(),
      course:             row['Course'],
      batchYear:          row['Batch_Year']?.toString(),
      yearOfStudy:        getYearOfStudy(row['Batch_Year']),
      section:            row['Section'],
      admissionType:      row['Admission_Type'],
      firstGraduate:      row['First Graduate'],
      tenthSchool:        row['10th_School_Name'],
      tenthPercentage:    row['10th_Percentage'],
      twelfthSchool:      row['12th_school_name'],
      twelfthPercentage:  row['12th_Percentage'],
      twelfthGroup:       row['12th_Group'],
      diplomaCollege:     row['Diploma_College_Name'],
      diplomaPercentage:  row['Diploma_Percentage'],
      arrear:             row['Arrear']?.toString(),
      cgpa:               row['CGPA'],
      placementStatus:    row['Placement_Status (Placed or Not)'],
      numberOfCompanies:  row['Number of Company'],
      companyName:        row['Company_Name'],
      highestPackage:     row['Highest Package'],
      internshipDetails:  row['Internship_Details'],
    }));

    // Insert all students
    await Student.insertMany(students);
    console.log(`✅ Successfully uploaded ${students.length} students to MongoDB!`);

    // Show departments and years found
    const depts = [...new Set(students.map(s => s.department).filter(Boolean))];
    const years = [...new Set(students.map(s => s.yearOfStudy).filter(Boolean))].sort();
    console.log('📚 Departments found:', depts);
    console.log('🎓 Years of study found:', years);

  } catch (err) {
    console.error('❌ Upload failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

uploadStudents();