// ─────────────────────────────────────────
//  src/ai/intentDetector.js
//  Classifies user messages into intent categories
//  Used to route queries to correct handler
// ─────────────────────────────────────────
const Groq = require('groq-sdk');
const logger = require('../utils/logger');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const INTENTS = [
    'SEARCH_STUDENT',   // Looking for specific student info
    'DEPT_REPORT',      // Want department-level statistics
    'ATTENDANCE',       // Asking about attendance records
    'RESULTS',          // Asking about exam marks/grades/CGPA
    'UPDATE_RECORD',    // Want to add or modify student data
    'UPLOAD_DATA',      // Want to upload an Excel file
    'AT_RISK',          // Want list of at-risk students
    'TOPPERS',          // Want top-performing students list
    'GENERAL',          // General question or greeting
];

// ── Keyword fallback (no API needed) ─────
const KEYWORD_MAP = {
    SEARCH_STUDENT: ['search', 'find', 'look up', 'roll no', 'student name', 'who is', 'details of', 'profile'],
    DEPT_REPORT: ['report', 'department report', 'dept report', 'summary', 'statistics', 'overview'],
    ATTENDANCE: ['attendance', 'present', 'absent', 'percentage', 'shortage', 'defaulter'],
    RESULTS: ['result', 'marks', 'grade', 'cgpa', 'gpa', 'exam', 'semester', 'pass', 'fail', 'arrear'],
    UPLOAD_DATA: ['upload', 'send file', 'add data', 'update data', 'import'],
    AT_RISK: ['at risk', 'at-risk', 'risk', 'below 75', 'low attendance', 'defaulters', 'detained'],
    TOPPERS: ['topper', 'top student', 'best student', 'rank', 'highest cgpa', 'best performer'],
    UPDATE_RECORD: ['update', 'change', 'edit', 'modify', 'correct', 'add student', 'delete'],
};

function keywordFallback(text) {
    const lower = text.toLowerCase();
    for (const [intent, keywords] of Object.entries(KEYWORD_MAP)) {
        if (keywords.some(kw => lower.includes(kw))) return intent;
    }
    return 'GENERAL';
}

// ── Main intent detection via Groq ────────
async function detectIntent(message) {
    const lower = message.trim().toLowerCase();

    // Quick shortcuts — don't waste API call
    if (['hi', 'hello', 'hey', 'start', 'menu', 'help'].includes(lower)) {
        return 'GENERAL';
    }

    try {
        const prompt = `Analyze this message from a college staff member and classify their intent into EXACTLY ONE of these categories:

SEARCH_STUDENT - Looking for specific student info by name or roll number
DEPT_REPORT    - Want department-level statistics or full report  
ATTENDANCE     - Asking about attendance records or percentages
RESULTS        - Asking about exam marks, grades, CGPA, pass/fail
UPDATE_RECORD  - Want to add or modify student data
UPLOAD_DATA    - Want to upload an Excel/data file
AT_RISK        - Want list of at-risk students (low attendance/CGPA)
TOPPERS        - Want top-performing students list
GENERAL        - General question, greeting, or unclear request

Message: "${message}"

Respond with ONLY the category name. No explanation, no punctuation.`;

        const completion = await groq.chat.completions.create({
            model: MODEL,
            max_tokens: 10,
            temperature: 0.0,
            messages: [{ role: 'user', content: prompt }],
        });

        const raw = completion.choices[0]?.message?.content?.trim().toUpperCase() || '';
        const intent = INTENTS.includes(raw) ? raw : keywordFallback(message);

        logger.info(`Intent detected: ${intent} for "${message.substring(0, 50)}"`);
        return intent;

    } catch (err) {
        logger.warn(`Intent detection API failed, using keywords: ${err.message}`);
        return keywordFallback(message);
    }
}

module.exports = { detectIntent };
