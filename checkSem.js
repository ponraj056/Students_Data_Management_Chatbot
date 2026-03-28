require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI, { dbName: 'college_db' }).then(async () => {
  const R = mongoose.model('ITResult', new mongoose.Schema({}, { strict: false, collection: 'it_results' }));
  const r = await R.findOne({}).lean();
  console.log('Sample doc:');
  console.log('  rollNo:', r.rollNo);
  console.log('  subject:', r.subject);
  console.log('  semester:', r.semester, typeof r.semester);
  console.log('  sgpa:', r.sgpa);
  console.log('  cgpa:', r.cgpa);
  const count5 = await R.countDocuments({ semester: 5 });
  console.log('Count semester=5:', count5);
  process.exit();
});