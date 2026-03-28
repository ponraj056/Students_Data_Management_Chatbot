// ─────────────────────────────────────────
//  src/handlers/updateHandler.js
//  Add / update student records via chat
// ─────────────────────────────────────────
const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const { sendTextMessage } = require('../whatsapp/sender');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// ── Extract update intent from free text ──
async function parseUpdateIntent(message) {
    const prompt = `Extract update intent from this message from college staff.

Message: "${message}"

Return ONLY valid JSON (no explanation):
{
  "action": "add" | "update" | "delete",
  "rollNumber": "extracted roll number or null",
  "studentName": "extracted name or null",
  "department": "extracted dept code or null",
  "fieldsToUpdate": {
    "attendance": "value or null",
    "marks": "value or null",
    "grade": "value or null",
    "status": "value or null",
    "year": "value or null",
    "section": "value or null",
    "email": "value or null",
    "phone": "value or null"
  },
  "confidence": 0.0
}`;

    try {
        const completion = await groq.chat.completions.create({
            model: MODEL,
            max_tokens: 300,
            temperature: 0.0,
            messages: [{ role: 'user', content: prompt }],
        });

        const text = completion.choices[0]?.message?.content || '{}';
        const clean = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);

    } catch (err) {
        logger.warn('Update intent parse failed:', err.message);
        return null;
    }
}

// ── Handle update request ─────────────────
async function handleUpdate(from, message, user) {
    try {
        // Only ADMIN and FACULTY can update records
        if (user.role === 'HOD') {
            await sendTextMessage(from,
                `ℹ️ HODs can *view* reports but cannot modify student records.\n` +
                `Please contact the department faculty or admin.`
            );
            return;
        }

        await sendTextMessage(from, `⏳ Analyzing update request...`);

        const intent = await parseUpdateIntent(message);

        if (!intent || intent.confidence < 0.3) {
            await sendTextMessage(from,
                `❓ I couldn't understand the update request clearly.\n\n` +
                `Please be specific. Examples:\n\n` +
                `📝 *Update attendance:*\n` +
                `"Update attendance for roll 22CS001 to 89%"\n\n` +
                `📝 *Update grade:*\n` +
                `"Change grade of Rahul Kumar (22CS001) in MATH to A+"\n\n` +
                `📝 *Update status:*\n` +
                `"Mark student 22CS001 as Detained"\n\n` +
                `For bulk updates, upload a new Excel file with updated data.`
            );
            return;
        }

        // Log the update intent (in a real system, persist to DB)
        logger.info(`Update intent: ${JSON.stringify(intent)}`);

        // Confirm what was understood
        const fields = Object.entries(intent.fieldsToUpdate || {})
            .filter(([, v]) => v !== null && v !== '')
            .map(([k, v]) => `  • ${k}: *${v}*`)
            .join('\n');

        await sendTextMessage(from,
            `✅ *Update Request Received*\n\n` +
            `Action: *${(intent.action || 'update').toUpperCase()}*\n` +
            `Roll No: *${intent.rollNumber || 'N/A'}*\n` +
            `Student: *${intent.studentName || 'N/A'}*\n` +
            `Department: *${intent.department || user.department}*\n\n` +
            (fields ? `Fields to Update:\n${fields}\n\n` : '') +
            `⚠️ *Note:* Individual record updates work best by uploading a fresh Excel file with the corrected data. ` +
            `This ensures all attendance, results, and master records stay synchronized.\n\n` +
            `📤 To bulk update: Upload \`${user.department}_students_2024.xlsx\` with corrected data.`
        );

    } catch (err) {
        logger.error('Update handler error:', err.message);
        await sendTextMessage(from, `❌ Update failed: ${err.message}`);
    }
}

module.exports = { handleUpdate };
