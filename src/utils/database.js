// src/utils/database.js
const mongoose = require('mongoose');
const logger = require('./logger');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'college_db',
    });
    isConnected = true;
    logger.success('MongoDB connected! ✅');
  } catch (err) {
    logger.error('MongoDB connection failed: ' + err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };