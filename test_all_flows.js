require('dotenv').config();
const mongoose = require('mongoose');

// MOCK OUTBOUND WHATSAPP SENDER
const sender = require('./src/whatsapp/sender');
sender.sendTextMessage = async (to, msg) => console.log(`\n\x1b[36m[BOT -> ${to} (TEXT)]\x1b[0m\n${msg}`);
sender.sendListMessage = async (to, header, body) => console.log(`\n\x1b[35m[BOT -> ${to} (LIST MENU)]\x1b[0m\n${header}: ${body}`);
sender.sendButtonMessage = async (to, header, body) => console.log(`\n\x1b[35m[BOT -> ${to} (BUTTON)]\x1b[0m\n${header}: ${body}`);

// IMPORTS
const { startSearch, onYearSelected, onNameInput } = require('./src/handlers/searchHandler');
const { handleResults } = require('./src/handlers/resultsHandler');
const { handleAttendance } = require('./src/handlers/attendanceHandler');

// MOCK USERS FOR DIFFERENT ROLES
const MOCK_STUDENT = { role: 'STUDENT', department: 'IT', name: 'Naren', empId: '922523205001' };
const MOCK_HOD     = { role: 'HOD', department: 'IT', name: 'Dr. Manivannan', empId: 'HOD-IT' };
const MOCK_ADMIN   = { role: 'ADMIN', department: 'ADMIN', name: 'Super Admin', empId: 'ADMIN-01' };

async function runAllTests() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'college_db' });
  console.log('✅ MongoDB Connected. Starting full role validation test suite...\n');

  try {
    // -----------------------------------------------------
    // SCENARIO 1: STUDENT ROLES & LIMITATIONS
    // -----------------------------------------------------
    console.log('\x1b[42m\x1b[30m SCENARIO 1: STUDENT CAPABILITIES & RESTRICTIONS \x1b[0m');
    
    console.log('\n\x1b[33m--- A. Student clicks "My Profile" (Should auto-show their own profile) ---\x1b[0m');
    await startSearch('student_number', MOCK_STUDENT);

    console.log('\n\x1b[33m--- B. Student tries to search for another student (Should be blocked) ---\x1b[0m');
    await onYearSelected('student_number', 'YEAR_1', MOCK_STUDENT);

    console.log('\n\x1b[33m--- C. Student checks their own results ---\x1b[0m');
    await handleResults('student_number', MOCK_STUDENT.empId, MOCK_STUDENT);


    // -----------------------------------------------------
    // SCENARIO 2: HOD ROLES & CAPABILITIES
    // -----------------------------------------------------
    console.log('\n\x1b[42m\x1b[30m SCENARIO 2: HOD (DEPARTMENTAL) CAPABILITIES \x1b[0m');

    console.log('\n\x1b[33m--- A. HOD starts a student search (Should get the Year Selection Menu) ---\x1b[0m');
    await startSearch('hod_number', MOCK_HOD);

    console.log('\n\x1b[33m--- B. HOD checks Top 10 Toppers for Sem 5 in IT ---\x1b[0m');
    await handleResults('hod_number', 'toppers sem 5', MOCK_HOD);

    console.log('\n\x1b[33m--- C. HOD checks Pass/Fail Stats in IT ---\x1b[0m');
    await handleResults('hod_number', 'pass fail stat sem 5', MOCK_HOD);
    
    console.log('\n\x1b[33m--- D. HOD queries below 75% attendance for IT ---\x1b[0m');
    await handleAttendance('hod_number', 'below 75', MOCK_HOD);


    // -----------------------------------------------------
    // SCENARIO 3: ADMIN GLOBAL CAPABILITIES
    // -----------------------------------------------------
    console.log('\n\x1b[42m\x1b[30m SCENARIO 3: ADMIN (GLOBAL) CAPABILITIES \x1b[0m');

    console.log('\n\x1b[33m--- A. Admin checks global arrears across ALL departments ---\x1b[0m');
    // Using a fake query string so it doesn't trigger semester regex, explicitly "arrears"
    await handleResults('admin_number', 'arrear students', MOCK_ADMIN);


    console.log('\n\n✅ ALL TESTS EXECUTED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Test failed with error:', err);
  } finally {
    process.exit(0);
  }
}

runAllTests();
