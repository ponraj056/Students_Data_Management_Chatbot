// ─────────────────────────────────────────
//  whatsapp/mediaDownloader.js
//  Downloads media files from WhatsApp CDN
// ─────────────────────────────────────────
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.WHATSAPP_TOKEN;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

async function downloadMedia(mediaId, filename) {
  // Step 1: Get the CDN URL of the media file
  const metaRes = await axios.get(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
  const mediaUrl = metaRes.data.url;

  // Step 2: Download the actual file bytes
  const fileRes = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  // Step 3: Save to disk
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(UPLOAD_DIR, `${Date.now()}_${safeName}`);
  fs.writeFileSync(filePath, fileRes.data);

  console.log(`💾 Downloaded: ${filePath}`);
  return filePath;
}

module.exports = { downloadMedia };
