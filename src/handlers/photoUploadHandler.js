require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const { sendTextMessage } = require('../whatsapp/sender');
const { downloadMedia } = require('../whatsapp/mediaDownloader');
const { getSession } = require('../whatsapp/sessionManager');
const Student = require('../models/studentModel');
const logger = require('../utils/logger');

function isPhotoUploadCommand(text) {
  return /^upload\s+photo\s+\d+$/i.test(text.trim());
}

function parseRegisterNumber(text) {
  const match = text.match(/\d+/);
  return match ? match[0] : null;
}

async function handlePhotoUploadCommand(from, text) {
  try {
    const regNo = parseRegisterNumber(text);
    if (!regNo) {
      await sendTextMessage(from, '❌ Invalid register number. Use: upload photo 922523205002');
      return;
    }

    const student = await Student.findOne({ registerNumber: regNo }).lean().select('name registerNumber');
    if (!student) {
      await sendTextMessage(from, `❌ Student not found: ${regNo}`);
      return;
    }

    // Store in MAIN session object (not separate Map)
    const session = getSession(from);
    session.photoUpload = {
      regNo: student.registerNumber,
      studentName: student.name,
      timestamp: Date.now()
    };

    logger.info(`📸 Photo session started | from=${from} | regNo=${student.registerNumber}`);

    await sendTextMessage(from,
      `📸 *Upload Photo*\n\n` +
      `Student : *${student.name}*\n` +
      `Reg No  : ${student.registerNumber}\n\n` +
      `Please send the photo now.\n` +
      `(Send as image or file — JPG or PNG)`
    );

  } catch (error) {
    logger.error('Photo upload command error:', error);
    await sendTextMessage(from, '❌ Error: ' + error.message);
  }
}

async function handleIncomingPhoto(from, message) {
  try {
    const session = getSession(from);
    const photoSession = session.photoUpload;

    logger.info(`📸 handleIncomingPhoto | from=${from} | type=${message?.type} | hasSession=${!!photoSession}`);

    if (!photoSession) return false; // No active session — ignore, let other handlers run

    // Only handle image or document types
    if (message?.type !== 'image' && message?.type !== 'document') return false;

    // 10 minute timeout
    if (Date.now() - photoSession.timestamp > 10 * 60 * 1000) {
      delete session.photoUpload;
      await sendTextMessage(from, '⏱️ Session expired. Try again.');
      return true;
    }

    const { regNo, studentName } = photoSession;

    const mediaId  = message?.image?.id || message?.document?.id;
    const mimeType = message?.image?.mime_type || message?.document?.mime_type || 'image/jpeg';
    const ext      = mimeType.includes('png') ? 'png' : 'jpg';
    const fileName = `student_${regNo}.${ext}`;

    if (!mediaId) {
      await sendTextMessage(from, '❌ Could not read image. Please send again.');
      return true;
    }

    await sendTextMessage(from, `⏳ Uploading photo for *${studentName}*...`);

    const filePath = await downloadMedia(mediaId, fileName);
    if (!filePath) {
      await sendTextMessage(from, '❌ Failed to download. Please send again.');
      return true;
    }

    const cloudUrl = await uploadToCloudinary(filePath, fileName, regNo);
    if (!cloudUrl) {
      await sendTextMessage(from, '❌ Cloudinary upload failed. Please try again.');
      return true;
    }

    await Student.updateOne(
      { registerNumber: regNo },
      { $set: { photo: cloudUrl, photoUploadedAt: new Date(), photoUploadedBy: from } }
    );

    delete session.photoUpload;

    await sendTextMessage(from,
      `✅ *Photo Updated Successfully!*\n\n` +
      `👤 Student : ${studentName}\n` +
      `🔢 Reg No  : ${regNo}\n` +
      `☁️  Saved to Cloudinary\n\n` +
      `Type *menu* to continue.`
    );

    logger.info(`✅ Photo uploaded: ${regNo} | ${studentName} | ${cloudUrl}`);
    return true;

  } catch (error) {
    logger.error('Photo upload error:', error);
    const session = getSession(from);
    delete session.photoUpload;
    await sendTextMessage(from, '❌ Error: ' + error.message);
    return true;
  }
}

async function uploadToCloudinary(filePath, fileName, regNo) {
  try {
    const fs        = require('fs');
    const imageBuffer = fs.readFileSync(filePath);
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey    = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      logger.error('Missing Cloudinary credentials');
      return null;
    }

    try {
      const form = new FormData();
      form.append('file', imageBuffer, { filename: fileName });
      form.append('upload_preset', 'unsigned');
      form.append('folder', 'vsb_students');
      const res = await axios.post(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, form, { headers: form.getHeaders(), timeout: 30000 });
      return res.data.secure_url;
    } catch (_) {
      const crypto    = require('crypto');
      const timestamp = Math.floor(Date.now() / 1000);
      const params    = { folder: 'vsb_students', public_id: `student_${regNo}`, timestamp };
      const sortedStr = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
      const signature = crypto.createHash('sha256').update(sortedStr + apiSecret).digest('hex');

      const form2 = new FormData();
      form2.append('file', imageBuffer, { filename: fileName });
      form2.append('folder', 'vsb_students');
      form2.append('public_id', `student_${regNo}`);
      form2.append('timestamp', timestamp);
      form2.append('api_key', apiKey);
      form2.append('signature', signature);
      const res2 = await axios.post(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, form2, { headers: form2.getHeaders(), timeout: 30000 });
      return res2.data.secure_url;
    }
  } catch (error) {
    logger.error('Cloudinary upload error: ' + error.message);
    return null;
  } finally {
    try { require('fs').unlinkSync(filePath); } catch (_) {}
  }
}

module.exports = { isPhotoUploadCommand, handlePhotoUploadCommand, handleIncomingPhoto };