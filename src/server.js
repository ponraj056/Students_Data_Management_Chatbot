// ─────────────────────────────────────────
//  src/server.js
// ─────────────────────────────────────────
require('dotenv').config();

const express  = require('express');
const fs       = require('fs-extra');
const mongoose = require('mongoose');

const { handleWebhook, verifyWebhook } = require('./whatsapp/receiver');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Connect MongoDB ───────────────────────
// CRITICAL: dbName: 'college_db' மட்டும் use பண்ணும்
mongoose.connect(process.env.MONGODB_URI, { dbName: 'college_db' })
  .then(() => console.log('✅ MongoDB Connected → college_db'))
  .catch(err => {
    console.error('❌ MongoDB failed:', err.message);
    process.exit(1);
  });

// ── Middleware ────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/outputs', express.static(process.env.OUTPUT_DIR || './outputs'));

// ── Ensure dirs exist ─────────────────────
['./uploads', './outputs', './data'].forEach(d => fs.ensureDirSync(d));

// users.json இல்லன்னா create பண்ணு
const usersFile = process.env.USERS_FILE || './data/users.json';
if (!fs.existsSync(usersFile)) {
  fs.outputJsonSync(usersFile, { users: [] });
  console.log('📝 Created data/users.json');
}

// ── Webhook Routes ────────────────────────
app.get('/webhook',  verifyWebhook);
app.post('/webhook', handleWebhook);

// ── Health Check ──────────────────────────
app.get('/health', async (req, res) => {
  const { getDeptModels, DEPARTMENTS } = require('./models/deptModels');
  const counts = {};
  for (const dept of DEPARTMENTS) {
    try {
      const { Student } = getDeptModels(dept);
      counts[dept] = await Student.countDocuments();
    } catch { counts[dept] = 0; }
  }
  res.json({
    status: 'ok',
    mongo: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    db: 'college_db',
    studentCounts: counts,
  });
});

// ── Start ─────────────────────────────────
app.listen(PORT, () => {
  console.log('\n' + '═'.repeat(50));
  console.log('🎓  V.S.B ENGINEERING COLLEGE — WhatsApp Bot');
  console.log('═'.repeat(50));
  console.log('🚀  Port     :', PORT);
  console.log('📡  Webhook  :', (process.env.BASE_URL || '') + '/webhook');
  console.log('🏥  Health   : http://localhost:' + PORT + '/health');
  console.log('═'.repeat(50) + '\n');
});