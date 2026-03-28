// src/utils/cloudinaryHelper.js
// Cloudinary photo upload + fetch helper
// Used by: searchHandler.js, studentDetails.js, receiver.js

const cloudinary = require('cloudinary').v2;

// ─── Configure Cloudinary ─────────────────────────────────────────
cloudinary.config({
  cloud_name:  process.env.CLOUDINARY_CLOUD_NAME,
  api_key:     process.env.CLOUDINARY_API_KEY,
  api_secret:  process.env.CLOUDINARY_API_SECRET,
});

// ─── Upload image buffer to Cloudinary ───────────────────────────
// Returns public URL or null on failure
async function uploadToCloudinary(imageBuffer, registerNumber) {
  return new Promise((resolve) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder:    'vsb_students',
        public_id: `student_${registerNumber}`,
        overwrite: true,
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          console.log('⚠️ Cloudinary upload failed:', error.message);
          resolve(null);
        } else {
          console.log('✅ Cloudinary upload success:', result.secure_url);
          resolve(result.secure_url);
        }
      }
    );
    uploadStream.end(imageBuffer);
  });
}

// ─── Upload from local file path ──────────────────────────────────
async function uploadFileToCloudinary(filePath, registerNumber) {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder:    'vsb_students',
      public_id: `student_${registerNumber}`,
      overwrite: true,
      resource_type: 'image',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto', fetch_format: 'auto' }
      ]
    });
    console.log('✅ Cloudinary upload success:', result.secure_url);
    return result.secure_url;
  } catch (err) {
    console.log('⚠️ Cloudinary upload failed:', err.message);
    return null;
  }
}

// ─── Download WhatsApp media → upload to Cloudinary ──────────────
async function uploadWhatsAppPhotoToCloudinary(mediaId, registerNumber) {
  const axios = require('axios');
  try {
    // Step 1: Get media URL from WhatsApp
    const mediaRes = await axios.get(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
    );

    // Step 2: Download image bytes
    const imageRes = await axios.get(mediaRes.data.url, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
    });

    // Step 3: Upload to Cloudinary
    const url = await uploadToCloudinary(Buffer.from(imageRes.data), registerNumber);
    return url;

  } catch (err) {
    console.log('⚠️ WhatsApp photo download failed:', err.message);
    return null;
  }
}

// ─── Send Cloudinary photo via WhatsApp ───────────────────────────
async function sendCloudinaryPhoto(to, photoUrl, caption) {
  const axios = require('axios');
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link: photoUrl, caption: caption || '' }
      },
      {
        headers: {
          Authorization:  `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`📸 Cloudinary photo sent to ${to}`);
    return true;
  } catch (err) {
    console.log('⚠️ Cloudinary photo send failed:', err.message);
    return false;
  }
}

// ─── Check if URL is a Cloudinary URL ────────────────────────────
function isCloudinaryUrl(url) {
  if (!url) return false;
  return url.includes('cloudinary.com') || url.includes('res.cloudinary.com');
}

module.exports = {
  uploadToCloudinary,
  uploadFileToCloudinary,
  uploadWhatsAppPhotoToCloudinary,
  sendCloudinaryPhoto,
  isCloudinaryUrl,
};