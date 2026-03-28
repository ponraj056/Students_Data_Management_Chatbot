const express = require('express');
const axios = require('axios');
const { getPassFailStats, formatPassFailStats, getPassFailByDepartment, formatDepartmentStats } = require('../handlers/statisticsHandler');

const router = express.Router();

// Get Student Model
const Student = require('../models/student');

// WhatsApp API Configuration
const WHATSAPP_API_URL = 'https://graph.instagram.com/v18.0';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;

// Bot Configuration
const BOT_NAME = process.env.BOT_NAME || 'V.S.B Engineering CollegeBot';

/**
 * Send WhatsApp Message
 */
async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Message sent to ${phoneNumber}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error sending message to ${phoneNumber}:`, error.message);
    throw error;
  }
}

/**
 * Greeting Message
 */
const getGreetingMessage = (userName = 'User') => {
  return `
🎓 *${BOT_NAME}*

Welcome, ${userName}!

I can help you with:

📋 *Exam Results* - Marks, CGPA, toppers, arrears
📊 *Statistics* - Pass/Fail rates with percentage
📈 *Department Data* - Dept-wise statistics
🔍 *Student Search* - Search by roll number

📌 Type any option below to continue:

1️⃣ Roll number - Search student by roll
2️⃣ Toppers - View semester toppers
3️⃣ Arrears - View arrear students
4️⃣ Statistics - Pass/Fail statistics
5️⃣ Dept Stats - Department-wise stats

*Type "menu" anytime to see options*
  `.trim();
};

/**
 * Menu Message
 */
const getMenuMessage = () => {
  return `
📚 *EXAM RESULTS MENU*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Options:*

1️⃣ *Roll number*
   Search student by roll
   Example: *922523205001*

2️⃣ *Toppers*
   View semester toppers
   Example: *toppers sem 5*

3️⃣ *Arrears*
   View arrear students
   Example: *arrear students*

4️⃣ *Statistics*
   Pass/Fail statistics ⭐ NEW
   Example: *statistics*

5️⃣ *Dept Stats*
   Department-wise statistics
   Example: *dept stats*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Type any option or "menu" to see this again.
  `.trim();
};

/**
 * Webhook Verification (GET)
 */
router.get('/webhook', (req, res) => {
  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (token === verifyToken) {
    console.log('✅ Webhook verified');
    res.send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

/**
 * Main Webhook Handler (POST)
 */
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Validate request
    if (!body.entry || !body.entry[0] || !body.entry[0].changes[0]) {
      return res.sendStatus(200);
    }

    const changes = body.entry[0].changes[0];
    if (!changes.value || !changes.value.messages) {
      return res.sendStatus(200);
    }

    const message = changes.value.messages[0];
    const phoneNumber = message.from;
    const messageText = (message.text?.body || '').toLowerCase().trim();
    const timestamp = new Date().toLocaleTimeString();

    console.log(`[${timestamp}] ℹ️  From: ${phoneNumber} | Type: ${message.type}`);
    console.log(`[${timestamp}] 📝 Message: ${messageText}`);

    // ========== MENU/GREETING HANDLER ==========
    if (messageText === 'hi' || messageText === 'hello' || messageText === 'start' || messageText === 'menu') {
      const greeting = getGreetingMessage('User');
      await sendWhatsAppMessage(phoneNumber, greeting);
      return res.sendStatus(200);
    }

    // ========== STATISTICS HANDLER ==========
    if (messageText === 'statistics' || 
        messageText === 'pass fail stats' ||
        messageText === '4' ||
        messageText === 'stats' ||
        messageText === 'pass fail') {
      
      try {
        console.log('📊 Fetching pass/fail statistics...');
        
        const allStudents = await Student.find({});
        
        if (allStudents.length === 0) {
          await sendWhatsAppMessage(phoneNumber, '❌ No student data available');
          return res.sendStatus(200);
        }
        
        const stats = getPassFailStats(allStudents);
        const statsMessage = formatPassFailStats(stats);
        
        await sendWhatsAppMessage(phoneNumber, statsMessage);
        
        console.log(`✅ Statistics sent | Total: ${stats.totalStudents} | Pass: ${stats.passCount} | Fail: ${stats.failCount}`);
        return res.sendStatus(200);
        
      } catch (error) {
        console.error('❌ Statistics error:', error);
        await sendWhatsAppMessage(phoneNumber, '❌ Error fetching statistics. Please try again.');
        return res.sendStatus(200);
      }
    }

    // ========== DEPARTMENT STATISTICS HANDLER ==========
    if (messageText === 'dept stats' || 
        messageText === 'department stats' ||
        messageText === '5') {
      
      try {
        console.log('📊 Fetching department-wise statistics...');
        
        const allStudents = await Student.find({});
        
        if (allStudents.length === 0) {
          await sendWhatsAppMessage(phoneNumber, '❌ No student data available');
          return res.sendStatus(200);
        }
        
        const deptStats = getPassFailByDepartment(allStudents);
        const deptMessage = formatDepartmentStats(deptStats);
        
        await sendWhatsAppMessage(phoneNumber, deptMessage);
        
        console.log(`✅ Department statistics sent to ${phoneNumber}`);
        return res.sendStatus(200);
        
      } catch (error) {
        console.error('❌ Department stats error:', error);
        await sendWhatsAppMessage(phoneNumber, '❌ Error fetching department statistics');
        return res.sendStatus(200);
      }
    }

    // ========== ARREARS HANDLER ==========
    if (messageText === 'arrears' || 
        messageText === 'arrear students' ||
        messageText === '3') {
      
      try {
        console.log('🔍 Fetching arrear students...');
        
        // Find students with arrears (assuming there's an arrears field)
        const arrearStudents = await Student.find({ 
          arrears: { $gt: 0 } 
        }).limit(50);
        
        if (arrearStudents.length === 0) {
          await sendWhatsAppMessage(phoneNumber, '✅ No arrear students found!');
          return res.sendStatus(200);
        }
        
        let arrearsMessage = `❌ *STUDENTS WITH ARREARS* (${arrearStudents.length} total)\n`;
        arrearsMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        arrearStudents.forEach((student, index) => {
          arrearsMessage += `${index + 1}. ${student.name || 'N/A'} (${student.rollNumber || student._id})\n`;
          arrearsMessage += `   Arrears: ${student.arrears || 0}\n`;
        });
        
        arrearsMessage += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nType "menu" to go back.`;
        
        await sendWhatsAppMessage(phoneNumber, arrearsMessage);
        
        console.log(`✅ Arrears list sent | Count: ${arrearStudents.length}`);
        return res.sendStatus(200);
        
      } catch (error) {
        console.error('❌ Arrears error:', error);
        await sendWhatsAppMessage(phoneNumber, '❌ Error fetching arrear students');
        return res.sendStatus(200);
      }
    }

    // ========== TOPPERS HANDLER ==========
    if (messageText.includes('toppers') || messageText === '2') {
      
      try {
        console.log('🏆 Fetching toppers...');
        
        // Extract semester if provided
        const semMatch = messageText.match(/sem\s*(\d+)/i);
        const semester = semMatch ? semMatch[1] : 5;
        
        const toppers = await Student.find({ 
          semester: parseInt(semester) 
        })
        .sort({ cgpa: -1 })
        .limit(10);
        
        if (toppers.length === 0) {
          await sendWhatsAppMessage(phoneNumber, `❌ No students found for Semester ${semester}`);
          return res.sendStatus(200);
        }
        
        let toppersMessage = `🏆 *TOP STUDENTS - SEMESTER ${semester}*\n`;
        toppersMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        toppers.forEach((student, index) => {
          toppersMessage += `${index + 1}. ${student.name || 'N/A'}\n`;
          toppersMessage += `   Roll: ${student.rollNumber || 'N/A'}\n`;
          toppersMessage += `   CGPA: ${student.cgpa || 'N/A'}\n\n`;
        });
        
        toppersMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nType "menu" to go back.`;
        
        await sendWhatsAppMessage(phoneNumber, toppersMessage);
        
        console.log(`✅ Toppers sent for Semester ${semester} | Count: ${toppers.length}`);
        return res.sendStatus(200);
        
      } catch (error) {
        console.error('❌ Toppers error:', error);
        await sendWhatsAppMessage(phoneNumber, '❌ Error fetching toppers');
        return res.sendStatus(200);
      }
    }

    // ========== ROLL NUMBER SEARCH ==========
    if (messageText.match(/^\d{10}$/) || messageText === '1') {
      
      try {
        console.log('🔍 Searching for student...');
        
        const rollNumber = messageText;
        const student = await Student.findOne({ 
          $or: [
            { rollNumber: rollNumber },
            { studentId: rollNumber }
          ]
        });
        
        if (!student) {
          await sendWhatsAppMessage(phoneNumber, `❌ No student found with Roll Number: ${rollNumber}`);
          return res.sendStatus(200);
        }
        
        let studentMessage = `👤 *STUDENT DETAILS*\n`;
        studentMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        studentMessage += `*Name:* ${student.name || 'N/A'}\n`;
        studentMessage += `*Roll:* ${student.rollNumber || 'N/A'}\n`;
        studentMessage += `*Department:* ${student.department || 'N/A'}\n`;
        studentMessage += `*Semester:* ${student.semester || 'N/A'}\n`;
        studentMessage += `*CGPA:* ${student.cgpa || 'N/A'}\n`;
        studentMessage += `*Marks:* ${student.marks || 'N/A'}\n`;
        studentMessage += `*Attendance:* ${student.attendance || 'N/A'}%\n`;
        studentMessage += `*Arrears:* ${student.arrears || 'None'}\n`;
        studentMessage += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nType "menu" to go back.`;
        
        await sendWhatsAppMessage(phoneNumber, studentMessage);
        
        console.log(`✅ Student found: ${student.name}`);
        return res.sendStatus(200);
        
      } catch (error) {
        console.error('❌ Search error:', error);
        await sendWhatsAppMessage(phoneNumber, '❌ Error searching for student');
        return res.sendStatus(200);
      }
    }

    // ========== DEFAULT: SHOW MENU ==========
    const menu = getMenuMessage();
    await sendWhatsAppMessage(phoneNumber, menu);
    
    return res.sendStatus(200);

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.sendStatus(200);
  }
});

/**
 * Health Check Endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    bot: BOT_NAME,
    timestamp: new Date(),
    webhook: '/webhook'
  });
});

module.exports = router;