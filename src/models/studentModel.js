// src/models/studentModel.js
// SHARED Student model — used by both studentDetails.js and updateStudent.js
// Single source of truth — no caching conflicts

const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  registerNumber:    String,
  name:              String,
  gender:            String,
  dob:               Date,
  bloodGroup:        String,
  aadhaarNumber:     String,
  community:         String,
  religion:          String,
  photo:             String,
  cutoffMark:        Number,
  mobileNumber:      String,
  email:             String,
  address:           String,
  hostelStudent:     String,
  collegeBusUser:    String,
  fatherName:        String,
  fatherOccupation:  String,
  fatherMobile:      String,
  motherName:        String,
  motherOccupation:  String,
  motherMobile:      String,
  guardianName:      String,
  guardianMobile:    String,
  guardianMobile2:   String,
  numberOfSiblings:  Number,
  department:        String,
  course:            String,
  batchYear:         String,
  yearOfStudy:       Number,
  section:           String,
  admissionType:     String,
  firstGraduate:     String,
  tenthSchool:       String,
  tenthPercentage:   mongoose.Schema.Types.Mixed,
  twelfthSchool:     String,
  twelfthPercentage: mongoose.Schema.Types.Mixed,
  twelfthGroup:      String,
  diplomaCollege:    String,
  diplomaPercentage: mongoose.Schema.Types.Mixed,
  arrear:            String,
  cgpa:              Number,
  placementStatus:   String,
  numberOfCompanies: mongoose.Schema.Types.Mixed,
  companyName:       String,
  highestPackage:    mongoose.Schema.Types.Mixed,
  internshipDetails: String,
  parentsIncome:     String,
  updatedAt:         { type: Date, default: Date.now },
}, { collection: 'students', strict: false });

// Single shared instance
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);

module.exports = Student;
