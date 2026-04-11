require('dotenv').config();
const mongoose = require('mongoose');

// Mock out WhatsApp sender so it just logs to console instead of sending real messages
const sender = require('./src/whatsapp/sender');
sender.sendTextMessage = async (from, msg) => {
  console.log(`\n\x1b[36m[MOCKED WHATSAPP MESSAGE]\x1b[0m\n${msg}\n`);
};

const { handleAttendance } = require('./src/handlers/attendanceHandler');

async function runTests() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'college_db' });
  console.log('✅ MongoDB Connected.');

  const mockHOD = {
    role: 'HOD',
    department: 'IT',
    name: 'Dr.Manivannan K'
  };

  try {
    console.log('\n\x1b[33m--- TEST 1: "below 95" ---\x1b[0m');
    await handleAttendance('test_ui', 'below 95', mockHOD);

    console.log('\n\x1b[33m--- TEST 2: "narendaran feb -01 to march-10" ---\x1b[0m');
    await handleAttendance('test_ui', 'narendaran feb -01 to march-10', mockHOD);

    console.log('\n\x1b[33m--- TEST 3: "naren 01/01/2026 to 12/12/2026" ---\x1b[0m');
    await handleAttendance('test_ui', 'naren 01/01/2026 to 12/12/2026', mockHOD);

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    process.exit(0);
  }
}

runTests();
