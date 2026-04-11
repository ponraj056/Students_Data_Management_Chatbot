require('dotenv').config();
const { sendTextMessage, sendListMessage, sendButtonMessage } = require('./sender');
const { getSession, setStage, resetToIdle, STAGES } = require('./sessionManager');
const { getUserByPhone, isRegistered, registerUser, registerStudent, canUpload, getRoleLabel } = require('../utils/roleChecker');
const { handleUpload, sendExampleFormat } = require('../handlers/uploadHandler');
const { isPhotoUploadCommand, handlePhotoUploadCommand, handleIncomingPhoto } = require('../handlers/photoUploadHandler');
const { startSearch, onYearSelected, onNameInput, onStudentSelected } = require('../handlers/searchHandler');
const { handleAttendance } = require('../handlers/attendanceHandler');
const { handleResults }    = require('../handlers/resultsHandler');
const { handleReport, sendReportMenu, generateAllReports } = require('../handlers/reportHandler');
const logger = require('../utils/logger');
const { queryOllama } = require('../services/ollamaService');

async function handleUserMessage(userMessage) {
    try {
        const response = await queryOllama(userMessage);
        return response.choices[0].message.content; // Adjust based on API response structure
    } catch (error) {
        console.error('Error handling user message:', error.message);
        return 'Sorry, I am unable to process your request right now.';
    }
}

function verifyWebhook(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
}

async function handleWebhook(req, res) {
  res.sendStatus(200);
  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];
    if (!message) return;
    const from = message.from;
    logger.info('From: ' + from + ' | Type: ' + message.type);
    await processMessage(from, message);
  } catch (err) {
    logger.error('Webhook error: ' + err.message);
  }
}

async function processMessage(from, message) {
  const session = getSession(from);
  const type    = message.type;

  // ── Registration flow ─────────────────────────────────────────
  if (!isRegistered(from)) {
    if (type === 'interactive' && session.stage === STAGES.AWAITING_ROLE) {
      const id = message.interactive?.list_reply?.id || '';
      if (id === 'ROLE_STUDENT') {
        session.regRole = 'STUDENT';
        setStage(from, STAGES.AWAITING_ROLL_NO);
        await sendTextMessage(from, 'Please enter your Roll Number:\nExample: 922523205001');
        return;
      } else if (id === 'ROLE_FACULTY' || id === 'ROLE_HOD') {
        session.regRole = id.replace('ROLE_', '');
        setStage(from, STAGES.AWAITING_EMP_ID);
        await sendTextMessage(from, 'Please enter your Employee ID:\nExample: FAC-IT-001');
        return;
      } else if (id === 'ROLE_PRINCIPAL') {
        await sendTextMessage(from, 'Principal access must be configured by the IT Admin.\nPlease contact your system administrator.');
        resetToIdle(from);
        return;
      }
    }

    if (type === 'text') {
      const text = message.text.body.trim().toUpperCase();

      if (session.stage === STAGES.AWAITING_EMP_ID) {
        session.regId = text;
        const isFacultyOrHod = session.regRole === 'FACULTY' || session.regRole === 'HOD';
        
        if (isFacultyOrHod) {
          // Directly register without OTP for Faculty and HOD
          const user = registerUser(from, session.regId);
          if (user) {
            resetToIdle(from);
            await sendTextMessage(from,
              'Registration Successful!\n\n' +
              'Name       : ' + user.name + '\n' +
              'Role       : ' + getRoleLabel(user.role) + '\n' +
              'Department : ' + user.department + '\n\n' +
              'Type menu to get started.'
            );
          } else {
            setStage(from, STAGES.AWAITING_ROLE);
            await sendTextMessage(from, 'Employee ID not found. Please contact Admin.\nType hi to try again.');
          }
          return;
        } else {
          const otp = Math.floor(100000 + Math.random() * 900000).toString();
          session.otp = otp;
          setStage(from, STAGES.AWAITING_OTP);
          logger.info('[OTP] ' + from + ' -> ' + otp);
          await sendTextMessage(from, 'Your OTP is: ' + otp + '\n(Dev mode - shown on screen)\n\nPlease enter the OTP to verify:');
          return;
        }
      }

      if (session.stage === STAGES.AWAITING_ROLL_NO) {
        session.regId = text;
        setStage(from, STAGES.AWAITING_STUDENT_DEPT);
        await sendTextMessage(from, 'Please enter your Department:\nIT / CSE / ECE / EEE / MECH / AIDS / AIML...');
        return;
      }

      if (session.stage === STAGES.AWAITING_STUDENT_DEPT) {
        session.regDept = text;
        let std = null;
        try {
          const { getDeptModels } = require('../models/deptModels');
          const { Student } = getDeptModels(text);
          std = await Student.findOne({ rollNo: session.regId }).lean();
          session.regName = std ? std.name : 'Student';
        } catch (e) {
          session.regName = 'Student';
        }

        if (!std) {
          await sendTextMessage(from, '❌ Student record not found in the database. Please check your Roll Number and Department, and type *hi* to try again.');
          resetToIdle(from);
          return;
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        session.otp = otp;
        setStage(from, STAGES.AWAITING_OTP);
        logger.info(`[OTP] Generated for ${session.regId} -> ${otp}`);

        let sentMessage = '';

        // 1. Try sending to registered Email
        if (std.email) {
          try {
            const nodemailer = require('nodemailer');
            if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
              const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
              });
              await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: std.email,
                subject: 'College Bot - Login Verification',
                text: `Hello ${std.name},\n\nYour OTP for WhatsApp Bot Login is: ${otp}\n\nDo not share this OTP with anyone. If you didn't request this, someone is trying to access your data.`
              });
              const parts = std.email.split('@');
              sentMessage = `your registered email (${parts[0].substring(0, 3)}***@${parts[1]})`;
            }
          } catch (err) {
            logger.error('Email OTP send failed: ' + err.message);
          }
        }

        // 2. Fallback: Send to registered phone number (via WhatsApp)
        if (!sentMessage && std.phone) {
          let stdWhatsApp = std.phone.toString().replace(/\D/g, '');
          if (stdWhatsApp.length === 10) stdWhatsApp = '91' + stdWhatsApp; // Format standard 10 digit Indian numbers

          if (stdWhatsApp !== from) {
            await sendTextMessage(stdWhatsApp, `🔒 *Security Alert*\nSomeone is trying to login to your account from another number.\n\nYour OTP is: *${otp}*`);
            sentMessage = `your registered WhatsApp number (******${stdWhatsApp.slice(-4)})`;
          } else {
            // If they are logging in from their actual registered number, send it to them directly
            await sendTextMessage(stdWhatsApp, `Your login OTP is: *${otp}*`);
            sentMessage = `your current WhatsApp number`;
          }
        }

        // 3. Dev Fallback (if the student has no email or phone in the database)
        if (!sentMessage) {
          sentMessage = `screen (Dev Mode: *${otp}*) because no email/phone was found in DB`;
        }

        await sendTextMessage(from, `🔒 *Security Verification*\n\nAn OTP has been sent to ${sentMessage}.\n\nPlease enter the 6-digit OTP to verify your identity:`);
        return;
      }

      if (session.stage === STAGES.AWAITING_OTP) {
        // Bypass OTP for Faculty and HOD
        const isFacultyOrHod = session.regRole === 'FACULTY' || session.regRole === 'HOD';
        if (isFacultyOrHod || text === session.otp) {
          if (session.regRole === 'STUDENT') {
            const user = registerStudent(from, session.regId, session.regDept, session.regName);
            resetToIdle(from);
            await sendTextMessage(from,
              'Registration Successful!\n\n' +
              'Name       : ' + user.name + '\n' +
              'Role       : Student\n' +
              'Department : ' + user.department + '\n\n' +
              'Type menu to get started.'
            );
          } else {
            const user = registerUser(from, session.regId);
            if (user) {
              resetToIdle(from);
              await sendTextMessage(from,
                'Registration Successful!\n\n' +
                'Name       : ' + user.name + '\n' +
                'Role       : ' + getRoleLabel(user.role) + '\n' +
                'Department : ' + user.department + '\n\n' +
                'Type menu to get started.'
              );
            } else {
              setStage(from, STAGES.AWAITING_ROLE);
              await sendTextMessage(from, 'Employee ID not found. Please contact Admin.\nType hi to try again.');
            }
          }
        } else {
          await sendTextMessage(from, 'Invalid OTP. Please try again:');
        }
        return;
      }
    }

    // Default - show role selection
    setStage(from, STAGES.AWAITING_ROLE);
    await sendListMessage(from,
      'V.S.B ENGINEERING COLLEGE',
      'Welcome! Please select your role to register.',
      'Select Role',
      [{ title: 'Roles', rows: [
        { id: 'ROLE_STUDENT',   title: 'Student',   description: 'Register as Student' },
        { id: 'ROLE_FACULTY',   title: 'Faculty',   description: 'Register as Faculty' },
        { id: 'ROLE_HOD',       title: 'HOD',       description: 'Register as Head of Department' },
        { id: 'ROLE_PRINCIPAL', title: 'Principal', description: 'Admin level access' },
      ]}]
    );
    return;
  }

  // ── Registered user ───────────────────────────────────────────
  const user = getUserByPhone(from);
  if (!user) { await sendTextMessage(from, 'User not found. Please contact Admin.'); return; }

  // ── Handle photo upload — runs for ALL message types if session active ──
  {
    const handled = await handleIncomingPhoto(from, message);
    if (handled) return;
  }

  // ── Document / Image upload ───────────────────────────────────
  if (type === 'document' || type === 'image') {
    if (!canUpload(user)) {
      await sendTextMessage(from, 'You do not have upload permission.\nOnly Admin, HOD, and Faculty can upload data.');
      return;
    }

    const { handleSmartExcelUpload, isExcelFile } = require('../parsers/Whatsappupload');
    if (isExcelFile(message)) {
      const reply = await handleSmartExcelUpload(message);
      if (reply) {
        await sendTextMessage(from, reply);
        await sendTextMessage(from, 'You can send another file or type menu to continue.');
        return;
      }
    }

    await handleUpload(from, message, user);
    await sendTextMessage(from, 'You can send another file or type menu to continue.');
    return;
  }

  // ── Interactive messages ──────────────────────────────────────
  if (type === 'interactive') {
    const btnId  = message.interactive?.button_reply?.id || '';
    const listId = message.interactive?.list_reply?.id   || '';
    const id     = btnId || listId;

    if (id.startsWith('YEAR_')) {
      await onYearSelected(from, id, user);
      return;
    }

    if (id.startsWith('STU_')) {
      await onStudentSelected(from, id);
      return;
    }

    switch (id) {
      case 'UPDATE_PHOTO': {
        const sess  = getSession(from);
        const regNo = sess.lastViewedRegNo;
        if (!regNo) {
          await sendTextMessage(from, '❌ Could not find student. Please search again.');
          return;
        }
        const { handlePhotoUploadCommand: hpuc } = require('../handlers/photoUploadHandler');
        await hpuc(from, `upload photo ${regNo}`);
        return;
      }

      case 'SEARCH_STUDENT':
        setStage(from, STAGES.AWAITING_YEAR_SELECT);
        await startSearch(from, user);
        return;

      case 'MY_ATTENDANCE':
        setStage(from, STAGES.AWAITING_ATTENDANCE);
        await handleAttendance(from, user.name, user);
        return;

      case 'MY_RESULTS':
        setStage(from, STAGES.AWAITING_RESULTS);
        await handleResults(from, user.name, user);
        return;

      case 'ATTENDANCE':
        setStage(from, STAGES.AWAITING_ATTENDANCE);
        await sendTextMessage(from,
          'Attendance Mode is now ON\n\n' +
          'Options:\n' +
          '- Date range  : Ponraj Jan-10 to Feb-10\n' +
          '- Below 95%   : below 95\n' +
          '- Dept summary: IT attendance\n\n' +
          'Type menu to exit this mode.'
        );
        return;

      case 'RESULTS':
        setStage(from, STAGES.AWAITING_RESULTS);
        await sendTextMessage(from,
          '📊 *Results Mode is now ON*\n\n' +
          '*Options:*\n' +
          '▪ Roll number      : 922523205001\n' +
          '▪ Toppers          : toppers sem 5\n' +
          '▪ Arrears          : arrear students\n' +
          '▪ Statistics       : pass fail stats\n' +
          '▪ CGPA Ranking     : cgpa ranking\n' +
          '▪ Subject Analysis : subject analysis sem 5\n\n' +
          'Type *menu* to exit this mode.'
        );
        return;

      case 'UPLOAD':
        if (!canUpload(user)) {
          await sendTextMessage(from, 'You do not have upload permission.');
          return;
        }
        await sendExampleFormat(from);
        return;

      case 'REPORT_STUDENT':
      case 'REPORT_ATTEND':
      case 'REPORT_RESULT': {
        const queryMap = { REPORT_STUDENT: 'students', REPORT_ATTEND: 'attendance', REPORT_RESULT: 'results' };
        session.pendingQuery = queryMap[id];
        setStage(from, STAGES.AWAITING_REPORT_FORMAT);
        await sendButtonMessage(from, 'Report Format', 'Select the format you need:', [
          { id: 'FMT_EXCEL', title: 'Excel' },
          { id: 'FMT_PDF',   title: 'PDF' },
          { id: 'FMT_TEXT',  title: 'Text Summary' },
        ]);
        return;
      }
      case 'REPORT_ALL': {
  await generateAllReports(from, user);
  return;
}

      case 'FMT_EXCEL':
      case 'FMT_PDF':
      case 'FMT_TEXT': {
        const fmt = id === 'FMT_EXCEL' ? 'excel' : id === 'FMT_PDF' ? 'pdf' : 'text';
        await handleReport(from, session.pendingQuery || 'students', user, fmt);
        resetToIdle(from);
        return;
      }

      default:
        break;
    }
    return;
  }

  // ── Text messages ─────────────────────────────────────────────
  if (type === 'text') {
    const text = message.text.body.trim();

    // ── Update command ──────────────────────────────────────────
    const { handleUpdateCommand, isUpdateCommand } = require('../parsers/updateStudent');
    if (isUpdateCommand(text)) {
      if (user.role === 'STUDENT') {
        const parts = text.match(/^update_([a-zA-Z0-9_@.]+)_/i);
        const part1 = parts ? parts[1] : '';
        const isOwnRegNo = part1.replace(/\s/g,'').toUpperCase() === user.empId.toUpperCase();
        if (!isOwnRegNo) {
          await sendTextMessage(from,
            '🔒 *Access Denied*\n\n' +
            'You can only update your own data.\n\n' +
            `Your register number: *${user.empId}*\n` +
            `Use: \`Update_${user.empId}_FieldName into NewValue\``
          );
          return;
        }
      }
      const reply = await handleUpdateCommand(from, text);
      await sendTextMessage(from, reply);
      return;
    }

    // ── Photo Upload Command ────────────────────────────────────
    if (isPhotoUploadCommand(text)) {
      await handlePhotoUploadCommand(from, text);
      return;
    }

    // ── All Reports Download ────────────────────────────────────
    if (/download all|full report|all reports/i.test(text)) {
      await generateAllReports(from, user);
      return;
    }

    // ── Global commands ─────────────────────────────────────────
    if (/^(logout|unregister)$/i.test(text)) {
      const fs = require('fs');
      const path = require('path');
      const usersPath = path.join(__dirname, '../../data/users.json');
      if (fs.existsSync(usersPath)) {
        let db = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
        let uIdx = db.users.findIndex(u => u.phone === from);
        if (uIdx !== -1) {
          db.users[uIdx].phone = ""; // Clear the phone to unregister the user
          fs.writeFileSync(usersPath, JSON.stringify(db, null, 2));
        }
      }
      resetToIdle(from);
      await sendTextMessage(from, '✅ You have been successfully logged out.\n\nType *hi* to register again with a different role or ID.');
      return;
    }

    if (/^(menu|hi|hello|start|help|back|home)$/i.test(text)) {
      resetToIdle(from);
      await sendMainMenu(from, user);
      return;
    }

    if (/^(clear|reset)$/i.test(text)) {
      resetToIdle(from);
      await sendTextMessage(from, 'Session cleared.\n\nType menu to start fresh.');
      return;
    }

    // ── Stage-based routing ─────────────────────────────────────
    switch (session.stage) {

      case STAGES.AWAITING_NAME_INPUT:
        await onNameInput(from, text, user);
        return;

      case STAGES.AWAITING_ATTENDANCE:
        if (user.role === 'STUDENT') {
          await handleAttendance(from, user.name, user);
        } else {
          await handleAttendance(from, text, user);
          await sendTextMessage(from, 'Enter another attendance query or type menu to go back.');
        }
        return;

      case STAGES.AWAITING_RESULTS:
        if (user.role === 'STUDENT') {
          await handleResults(from, user.name, user);
        } else {
          await handleResults(from, text, user);
          await sendTextMessage(from, 'Enter another roll number or type menu to go back.');
        }
        return;

      case STAGES.AWAITING_REPORT_FORMAT: {
        const fmt = /pdf/i.test(text) ? 'pdf' : /text/i.test(text) ? 'text' : 'excel';
        if (/download all|full report|all reports/i.test(text)) {
          await generateAllReports(from, user);
        } else {
          await handleReport(from, session.pendingQuery || '', user, fmt);
        }
        resetToIdle(from);
        return;
      }
    }

    // No active stage - send unrecognized text to Ollama AI
    const aiReply = await handleUserMessage(text);
    await sendTextMessage(from, aiReply);
    return;
  }
}

// ── Main Menu ─────────────────────────────────────────────────────
async function sendMainMenu(from, user) {

  if (user.role === 'STUDENT') {
    await sendListMessage(from,
      'V.S.B ENGINEERING COLLEGE',
      'Welcome, ' + user.name + '!\n' +
      'Role: 🎒 Student | Dept: ' + user.department,
      'Choose Action',
      [{
        title: 'My Profile',
        rows: [
          { id: 'SEARCH_STUDENT', title: 'View My Profile',  description: 'View your student details' },
          { id: 'MY_ATTENDANCE',  title: 'My Attendance',    description: 'View your attendance' },
          { id: 'MY_RESULTS',     title: 'My Results',       description: 'View your exam results' },
        ]
      }]
    );
    return;
  }

  const canUploadUser = canUpload(user);
  const sections = [
    {
      title: 'Student',
      rows: [{ id: 'SEARCH_STUDENT', title: 'Search Student', description: 'Search by year, name, or roll number' }]
    },
    {
      title: 'Data',
      rows: [
        { id: 'ATTENDANCE', title: 'Attendance',   description: 'View attendance or date range' },
        { id: 'RESULTS',    title: 'Exam Results', description: 'Marks, CGPA, toppers, arrears' },
      ]
    },
    {
      title: 'Reports',
      rows: [
        { id: 'REPORT_STUDENT', title: 'Student Report',    description: 'Download student list' },
        { id: 'REPORT_ATTEND',  title: 'Attendance Report', description: 'Download as Excel or PDF' },
        { id: 'REPORT_RESULT',  title: 'Results Report',    description: 'Download marks report' },
        { id: 'REPORT_ALL',      title: '📦 All Reports',       description: '4 years × Student+Attendance+Results' },
  ]
    }
  ];

  if (canUploadUser) {
    sections.push({
      title: 'Upload',
      rows: [{ id: 'UPLOAD', title: 'Upload Excel', description: 'Upload student, attendance, or results data' }]
    });
  }

  await sendListMessage(from,
    'V.S.B ENGINEERING COLLEGE',
    'Welcome, ' + user.name + '!\n' +
    'Role: ' + getRoleLabel(user.role) + ' | Dept: ' + user.department,
    'Choose Action',
    sections
  );
}

module.exports = { verifyWebhook, handleWebhook, handleUserMessage };