const express = require('express');
const multer = require('multer');
const path = require('path');
const { parseExcelFile } = require('../utils/excelParser'); // Import the new parser
const vectorService = require('../services/vectorService');

const router = express.Router();

// Setup multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * POST /api/rag/upload
 * Upload and process Excel file for student data
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // Validate file was uploaded
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded. Please send an Excel file.' 
      });
    }

    // Validate file type
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    
    if (!allowedExtensions.includes(fileExt)) {
      return res.status(400).json({ 
        error: `Invalid file type. Allowed: ${allowedExtensions.join(', ')}` 
      });
    }

    console.log('📁 Processing file:', req.file.originalname);

    // Parse Excel file with improved parser
    let studentData;
    try {
      studentData = parseExcelFile(req.file.path);
    } catch (parseError) {
      console.error('Parse error details:', parseError.message);
      
      // Provide helpful error message
      return res.status(400).json({
        error: 'Failed to parse Excel file',
        details: parseError.message,
        hint: 'Make sure your file has columns like: Student ID, Name, Attendance, Email, Phone, Department',
        example: 'Example file: IT_result_2024.xlsx with columns [Roll No, Student Name, Attendance %, Email, Phone, Department]'
      });
    }

    // Process with vector service
    const result = await vectorService.processStudentData(studentData);

    res.json({
      success: true,
      message: `✅ Successfully processed ${studentData.length} student records`,
      recordsProcessed: studentData.length,
      result
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Server error during file processing',
      message: error.message
    });
  }
});

/**
 * GET /api/rag/status
 * Check RAG system status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await vectorService.getStatus();
    res.json({ status, message: 'RAG system is running' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rag/query
 * Query student data using RAG
 */
router.post('/query', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const result = await vectorService.queryStudentData(query);
    res.json({ result });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;