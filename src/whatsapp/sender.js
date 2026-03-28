// ─────────────────────────────────────────
//  src/whatsapp/sender.js
//  All outbound WhatsApp message functions
// ─────────────────────────────────────────
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const BASE_URL = `https://graph.facebook.com/v18.0`;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;
const FOOTER = process.env.COLLEGE_NAME || '🎓 College Student Management';

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

// ── Send plain text ───────────────────────
async function sendTextMessage(to, text, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await axios.post(`${BASE_URL}/${PHONE_ID}/messages`, {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }, { headers });
      console.log(`💬 Text sent to ${to}`);
      return;
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 131056 && attempt < retries) {
        // Rate limit — wait and retry
        console.log(`⏳ Rate limit hit, waiting 3s... (attempt ${attempt})`);
        await new Promise(r => setTimeout(r, 3000 * attempt));
        continue;
      }
      console.error('❌ sendTextMessage error:', err.response?.data || err.message);
      return;
    }
  }
}

// ── Send interactive list menu ─────────────
async function sendListMessage(to, headerText, bodyText, buttonLabel, sections) {
  try {
    await axios.post(`${BASE_URL}/${PHONE_ID}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: headerText },
        body: { text: bodyText },
        footer: { text: FOOTER },
        action: { button: buttonLabel, sections },
      },
    }, { headers });
    console.log(`📋 List menu sent to ${to}`);
  } catch (err) {
    console.error('❌ sendListMessage error:', err.response?.data || err.message);
  }
}

// ── Send interactive button message ───────
async function sendButtonMessage(to, headerText, bodyText, buttons) {
  // buttons = [{ id: 'btn_id', title: 'Button Label' }]  (max 3)
  try {
    await axios.post(`${BASE_URL}/${PHONE_ID}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: { type: 'text', text: headerText },
        body: { text: bodyText },
        footer: { text: FOOTER },
        action: {
          buttons: buttons.map(b => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    }, { headers });
    console.log(`🔘 Button message sent to ${to}`);
  } catch (err) {
    console.error('❌ sendButtonMessage error:', err.response?.data || err.message);
  }
}

// ── Upload media + get media ID ───────────
async function uploadMedia(filePath, mimeType) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), {
    contentType: mimeType,
    filename: path.basename(filePath),
  });
  form.append('messaging_product', 'whatsapp');

  const res = await axios.post(`${BASE_URL}/${PHONE_ID}/media`, form, {
    headers: { Authorization: `Bearer ${TOKEN}`, ...form.getHeaders() },
  });
  return res.data.id;
}

// ── Send document ─────────────────────────
async function sendDocument(to, filePath, caption = '') {
  try {
    const mimeType = getMimeType(filePath);
    const mediaId = await uploadMedia(filePath, mimeType);

    await axios.post(`${BASE_URL}/${PHONE_ID}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: {
        id: mediaId,
        caption,
        filename: path.basename(filePath),
      },
    }, { headers });
    console.log(`📄 Document sent to ${to}: ${path.basename(filePath)}`);
  } catch (err) {
    console.error('❌ sendDocument error:', err.response?.data || err.message);
  }
}

// ── Send image ────────────────────────────
async function sendImage(to, filePath, caption = '') {
  try {
    const mediaId = await uploadMedia(filePath, 'image/jpeg');
    await axios.post(`${BASE_URL}/${PHONE_ID}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { id: mediaId, caption },
    }, { headers });
    console.log(`🖼️ Image sent to ${to}`);
  } catch (err) {
    console.error('❌ sendImage error:', err.response?.data || err.message);
  }
}

// ── MIME type helper ──────────────────────
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.zip': 'application/zip',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  };
  return map[ext] || 'application/octet-stream';
}

async function sendImageMessage(to, imagePath, caption) {
  try {
    const fs       = require('fs');
    const FormData = require('form-data');

    // Upload image to WhatsApp media
    const form = new FormData();
    form.append('file', fs.createReadStream(imagePath));
    form.append('type', 'image/jpeg');
    form.append('messaging_product', 'whatsapp');

    const uploadRes = await fetch(
      'https://graph.facebook.com/v18.0/' + process.env.WHATSAPP_PHONE_NUMBER_ID + '/media',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN },
        body: form,
      }
    );
    const uploadData = await uploadRes.json();
    if (!uploadData.id) throw new Error('Media upload failed');

    // Send image with caption
    const res = await fetch(
      'https://graph.facebook.com/v18.0/' + process.env.WHATSAPP_PHONE_NUMBER_ID + '/messages',
      {
        method: 'POST',
        headers: {
          Authorization:  'Bearer ' + process.env.WHATSAPP_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'image',
          image: { id: uploadData.id, caption: caption || '' },
        }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    return data;
  } catch (err) {
    logger.error('sendImageMessage error: ' + err.message);
    throw err;
  }
}
// ── Send image from URL (e.g. Cloudinary) ────────────────────────
async function sendImageUrl(to, imageUrl, caption = '') {
  try {
    // WhatsApp requires JPEG for link-based image sending.
    // Cloudinary can auto-convert by replacing the extension with .jpg
    let finalUrl = imageUrl;
    if (imageUrl.includes('res.cloudinary.com')) {
      finalUrl = imageUrl.replace(/\.(png|webp|gif)(\?.*)?$/i, '.jpg');
    }

    const res = await axios.post(`${BASE_URL}/${PHONE_ID}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: finalUrl, caption },
    }, { headers });
    console.log(`🖼️ Image URL sent to ${to}: ${finalUrl}`);
  } catch (err) {
    console.error('❌ sendImageUrl error:', err.response?.data || err.message);
  }
}

module.exports = { sendTextMessage, sendListMessage, sendButtonMessage, sendDocument, sendImage, sendImageMessage, sendImageUrl };