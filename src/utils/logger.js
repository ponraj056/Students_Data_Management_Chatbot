// ─────────────────────────────────────────
//  src/utils/logger.js
//  Colored console logger for easy debugging
// ─────────────────────────────────────────

const colors = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
};

function timestamp() {
  return new Date().toLocaleTimeString();
}

const logger = {
  // ✅ Success messages — green
  success: (msg) =>
    console.log(`${colors.green}[${timestamp()}] ✅ ${msg}${colors.reset}`),

  // ℹ️ Info messages — blue
  info: (msg) =>
    console.log(`${colors.blue}[${timestamp()}] ℹ️  ${msg}${colors.reset}`),

  // ⚠️ Warning messages — yellow
  warn: (msg) =>
    console.log(`${colors.yellow}[${timestamp()}] ⚠️  ${msg}${colors.reset}`),

  // ❌ Error messages — red
  error: (msg, err = '') =>
    console.log(`${colors.red}[${timestamp()}] ❌ ${msg} ${err}${colors.reset}`),

  // 📨 WhatsApp messages — cyan
  whatsapp: (msg) =>
    console.log(`${colors.cyan}[${timestamp()}] 📨 ${msg}${colors.reset}`),

  // 🧠 RAG pipeline messages — yellow
  rag: (msg) =>
    console.log(`${colors.yellow}[${timestamp()}] 🧠 ${msg}${colors.reset}`),
};

module.exports = logger;