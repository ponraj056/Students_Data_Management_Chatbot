require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const Student = require('./src/models/studentModel');

// Extract Google Drive file ID from various URL formats
function extractDriveFileId(url) {
  if (!url) return null;
  
  // Format: https://drive.google.com/open?id=ABC123
  let match = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  
  // Format: https://drive.google.com/file/d/ABC123/view
  match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  
  return null;
}

// Download image from Google Drive
async function downloadFromDrive(driveUrl) {
  const fileId = extractDriveFileId(driveUrl);
  if (!fileId) {
    return null;
  }

  // Try multiple URL formats
  const urlsToTry = [
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
    `https://lh3.googleusercontent.com/d/${fileId}`,
    `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
  ];

  for (const url of urlsToTry) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxRedirects: 10,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const buffer = Buffer.from(response.data);
      
      // Check if it's actually an image (magic bytes)
      const magic = buffer.slice(0, 8);
      const isJpeg = magic[0] === 0xFF && magic[1] === 0xD8;
      const isPng = magic[0] === 0x89 && magic[1] === 0x50;
      
      if (!isJpeg && !isPng) {
        continue;
      }

      if (buffer.length < 5000) {
        continue;
      }

      return buffer;
    } catch (e) {
      continue;
    }
  }

  return null;
}

// Upload to Cloudinary using API credentials
async function uploadToCloudinary(imageBuffer, fileName) {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.log(`  ❌ Missing Cloudinary credentials in .env`);
      return null;
    }

    const form = new FormData();
    form.append('file', imageBuffer, { filename: fileName });
    form.append('upload_preset', 'unsigned'); // Try unsigned first
    form.append('folder', 'vsb_students');

    const response = await axios.post(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 30000,
      }
    );

    return response.data.secure_url;
  } catch (error) {
    // If unsigned fails, try with auth
    try {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;

      const form = new FormData();
      form.append('file', imageBuffer, { filename: fileName });
      form.append('api_key', apiKey);
      form.append('folder', 'vsb_students');
      form.append('timestamp', Math.floor(Date.now() / 1000));

      // Sign the request (simplified)
      const crypto = require('crypto');
      const params = {
        folder: 'vsb_students',
        timestamp: Math.floor(Date.now() / 1000)
      };
      const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');
      const signature = crypto
        .createHash('sha256')
        .update(sortedParams + apiSecret)
        .digest('hex');

      form.append('signature', signature);

      const response = await axios.post(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        form,
        {
          headers: form.getHeaders(),
          timeout: 30000,
        }
      );

      return response.data.secure_url;
    } catch (err) {
      console.log(`  ❌ Upload error: ${err.response?.data?.error?.message || err.message}`);
      return null;
    }
  }
}

// Main migration
async function migratePhotos() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: 'college_db' });
    
    const students = await Student.find({ 
      photo: { $exists: true, $ne: '', $ne: null }
    }).lean();

    if (students.length === 0) {
      console.log('\n❌ No students with photos found!');
      console.log('Upload Excel file via WhatsApp first.\n');
      process.exit(1);
    }

    console.log(`\n📸 PHOTO MIGRATION TO CLOUDINARY`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log(`Total students: ${students.length}`);
    console.log(`Starting migration...\n`);

    let success = 0, failed = 0, skipped = 0;

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const num = (i + 1).toString().padStart(3, ' ');
      console.log(`[${num}/${students.length}] ${s.name} | ${s.registerNumber}`);

      if (!s.photo || !s.photo.includes('drive.google.com')) {
        console.log(`  ⏭️  Not a Drive URL — skipped`);
        skipped++;
        continue;
      }

      // Download
      process.stdout.write(`  📥 Downloading from Drive...`);
      const buffer = await downloadFromDrive(s.photo);
      
      if (!buffer) {
        console.log(`\n  ❌ Download failed`);
        failed++;
        continue;
      }

      const sizeKB = (buffer.length / 1024).toFixed(0);
      console.log(`\r  ✅ Downloaded (${sizeKB}KB)`);

      // Upload
      process.stdout.write(`  ☁️  Uploading to Cloudinary...`);
      const cloudUrl = await uploadToCloudinary(buffer, `student_${s.registerNumber}`);

      if (cloudUrl) {
        await Student.updateOne(
          { _id: s._id },
          { $set: { photo: cloudUrl, migratedAt: new Date() } }
        );
        console.log(`\r  ✅ Uploaded & saved`);
        console.log(`     ${cloudUrl.substring(0, 60)}...\n`);
        success++;
      } else {
        console.log(`\r  ❌ Upload failed\n`);
        failed++;
      }
    }

    // Summary
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`MIGRATION COMPLETE!\n`);
    console.log(`✅ Success : ${success}`);
    console.log(`❌ Failed  : ${failed}`);
    console.log(`⏭️  Skipped : ${skipped}\n`);

    if (success > 0) {
      console.log(`🎓 ${success} photos moved to Cloudinary!`);
      console.log(`✨ Photos will now load instantly in student search!\n`);
    }

  } catch (error) {
    console.error('Migration error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

migratePhotos();