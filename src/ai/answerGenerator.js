require('dotenv').config();
const Groq = require('groq-sdk');
const logger = require('../utils/logger');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const SYSTEM_PROMPT = `You are an intelligent College Student Data Management Assistant.
You help Faculty, HODs, and Administrators manage student records
across multiple engineering departments.

COLLEGE DEPARTMENTS:
UG: AIDS, AIML, BIO-MED, BIO-TECH, CSBS, CSE, CIVIL, CHEMICAL, CCE, ECE, EEE, IT, MECH
PG: M.E/M.Tech, MCA, MBA

YOUR RULES:
1. Answer ONLY from the provided student data context
2. Never reveal one department data to another department faculty
3. For attendance: flag students below 75% as AT-RISK
4. For results: identify PASS/FAIL/ARREAR accurately
5. Always include student count in department reports
6. Format student lists as clean readable tables
7. For searches show: Roll No, Name, Dept, Year, Attendance%, CGPA, Status
8. If data not found say: "No records found for [query] in [department]"
9. Never guess or approximate marks or grades
10. Always mention data upload date in reports`;

async function generateAnswer(query, chunks, userContext = {}) {
  const { role = 'FACULTY', department = 'ALL', name = 'Staff' } = userContext;

  const contextBlock = chunks.map((chunk, i) => {
    const src = chunk.metadata?.filename || chunk.metadata?.dept || 'Unknown';
    const score = chunk.score ? ` (relevance: ${(chunk.score * 100).toFixed(0)}%)` : '';
    return `--- Source ${i + 1}: ${src}${score} ---\n${chunk.text}`;
  }).join('\n\n');

  const userPrompt = `== STUDENT DATABASE CONTEXT ==
Department Access: ${department}
User Role: ${role} | Name: ${name}

${contextBlock}

== END CONTEXT ==

Based ONLY on the above student data, answer this question:
"${query}"

Provide a clear, accurate, professional answer.
For lists of students, format as a table.
For reports, use clear sections with headers.`;

  logger.rag(`Sending to Groq: "${query.substring(0, 60)}"`);

  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 2000,
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt },
    ],
  });

  const answer = response.choices[0]?.message?.content || 'No answer generated.';
  logger.success(`Answer generated (${answer.length} chars)`);
  return answer;
}

async function generateDeptReport(department, chunks, userContext = {}) {
  const { role = 'HOD', name = 'Staff' } = userContext;

  const contextBlock = chunks.map((c, i) =>
    `--- Record ${i + 1} ---\n${c.text}`
  ).join('\n\n');

  const reportPrompt = `== DEPARTMENT DATA ==
Department: ${department}

${contextBlock}

== END DATA ==

Generate a comprehensive department report for: ${department}
Requested by: ${role} — ${name}

Include these sections:
1. OVERVIEW — total students, year-wise breakdown
2. ATTENDANCE — average %, above 90%, below 75% AT-RISK list
3. ACADEMICS — average CGPA, pass %, students with arrears
4. TOP 5 PERFORMERS — by CGPA
5. AT-RISK STUDENTS — attendance below 75% OR CGPA below 5.0
6. RECOMMENDATIONS

Format as a professional college department report.`;

  logger.rag(`Generating ${department} department report...`);

  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 2000,
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: reportPrompt },
    ],
  });

  const report = response.choices[0]?.message?.content || 'Report generation failed.';
  logger.success(`Department report generated for ${department}`);
  return report;
}

async function detectIntent(message) {
  const prompt = `Classify this college staff message into ONE category:

Message: "${message}"

Categories:
SEARCH_STUDENT, DEPT_REPORT, ATTENDANCE, RESULTS,
UPDATE_RECORD, UPLOAD_DATA, AT_RISK, TOPPERS,
HACKATHON, INTERNSHIP, GENERAL

Reply with ONLY the category name. Nothing else.`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 20,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  const intent = response.choices[0]?.message?.content?.trim().toUpperCase() || 'GENERAL';
  logger.info(`Intent detected: ${intent}`);
  return intent;
}

module.exports = { generateAnswer, generateDeptReport, detectIntent };