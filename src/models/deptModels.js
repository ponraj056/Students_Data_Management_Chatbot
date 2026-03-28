const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  rollNo:      { type: String, required: true, index: true },
  name:        { type: String, required: true },
  year:        Number,
  section:     String,
  batch:       String,
  // Contact
  email:       String,
  phone:       String,
  // Parent
  parentName:  String,
  parentPhone: String,
  // Personal
  address:     String,
  bloodGroup:  String,
  aadhar:      String,
  // College
  busRoute:    String,
  hostel:      { type: String, enum: ['Hostel', 'Day Scholar', ''], default: '' },
  scholarship: String,
  arrearCount: { type: Number, default: 0 },
  // Meta
  status:      { type: String, default: 'Active' },
  course:      String,
  uploadedBy:  String,
  uploadedAt:  Date,
}, { timestamps: true });

const AttendanceSchema = new mongoose.Schema({
  rollNo:     String,
  name:       { type: String, required: true, index: true },
  date:       { type: String, required: true },
  status:     { type: String, enum: ['P', 'A'], default: 'A' },
  uploadedBy: String,
  uploadedAt: Date,
});
AttendanceSchema.index({ name: 1, date: 1 }, { unique: true });

const ResultSchema = new mongoose.Schema({
  rollNo:     { type: String, required: true, index: true },
  name:       String,
  semester:   Number,
  subject:    String,
  subCode:    String,
  grade:      String,
  gp:         Number,
  cgpa:       Number,
  gpa:        Number,
  arrears:    Number,
  result:     String,
  status:     String,
  uploadedBy: String,
  uploadedAt: Date,
});

const DEPARTMENTS = [
  'aids','aiml','biomed','biotech','csbs','cse',
  'civil','chemical','cce','ece','eee','it','mech',
  'me','mca','mba'
];

const modelCache = {};

function getDeptModels(dept) {
  const key = dept.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (!DEPARTMENTS.includes(key)) {
    throw new Error('Invalid department: ' + dept);
  }
  if (!modelCache[key]) {
    modelCache[key] = {
      Student:    mongoose.model(key + '_students',    StudentSchema,    key + '_students'),
      Attendance: mongoose.model(key + '_attendances', AttendanceSchema, key + '_attendance'),
      Result:     mongoose.model(key + '_results',     ResultSchema,     key + '_results'),
    };
  }
  return modelCache[key];
}

function isValidDept(dept) {
  const key = dept.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  return DEPARTMENTS.includes(key);
}

function getAllDepts() { return [...DEPARTMENTS]; }

module.exports = { getDeptModels, isValidDept, getAllDepts, DEPARTMENTS };