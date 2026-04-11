require('dotenv').config();
const mongoose = require('mongoose');
const { getDeptModels } = require('./src/models/deptModels');

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: 'college_db' });
    const { Attendance } = getDeptModels('IT');
    const sample = await Attendance.findOne().lean();
    console.log('Keys in IT Attendance record:', Object.keys(sample));
    console.log('Does rollNo exist?', !!sample.rollNo);
    console.log('Does empCode exist?', !!sample.empCode);
    console.log('Does _id exist?', !!sample._id);
    console.log('Sample record details:', JSON.stringify(sample, null, 2));
  } catch(e) {} finally { process.exit(0); }
}
test();
