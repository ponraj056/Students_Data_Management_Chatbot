// ─────────────────────────────────────────
//  src/whatsapp/sessionManager.js
//  In-memory session store for user state
//  Tracks registration stage, pending queries,
//  selected options, and user role context
// ─────────────────────────────────────────

// Session stages
const STAGES = {
    UNREGISTERED: 'UNREGISTERED',          // New user — not registered
    AWAITING_ROLE: 'AWAITING_ROLE',               // Selecting Student/Faculty/HOD
    AWAITING_EMP_ID: 'AWAITING_EMP_ID',       // Asked for employee ID
    AWAITING_ROLL_NO: 'AWAITING_ROLL_NO',         // Asked for student roll no
    AWAITING_STUDENT_DEPT: 'AWAITING_STUDENT_DEPT',    // Asked for student dept
    AWAITING_OTP: 'AWAITING_OTP',                 // Asked for OTP
    IDLE: 'IDLE',                  // Registered, menu shown
    AWAITING_SEARCH: 'AWAITING_SEARCH',       // Waiting for search query
    AWAITING_FORMAT: 'AWAITING_FORMAT',       // Waiting for format selection
    AWAITING_REPORT_TYPE: 'AWAITING_REPORT_TYPE',  // Waiting for report type
    AWAITING_DEPT: 'AWAITING_DEPT',         // Admin: waiting for dept selection
    AWAITING_UPDATE: 'AWAITING_UPDATE',       // Waiting for update text
    AWAITING_ATTENDANCE: 'AWAITING_ATTENDANCE',   // Waiting for attendance query
    AWAITING_RESULTS: 'AWAITING_RESULTS',      // Waiting for results query
};

// In-memory session store
// { phone -> { stage, user, pendingQuery, pendingIntent, pendingFormat,
//              pendingDept, pendingReportType, updatedAt } }
const sessions = {};

// ── Get or create session ─────────────────
function getSession(phone) {
    if (!sessions[phone]) {
        sessions[phone] = {
            stage: STAGES.UNREGISTERED,
            user: null,
            pendingQuery: null,
            pendingIntent: null,
            pendingFormat: null,
            pendingDept: null,
            pendingReportType: null,
            regRole: null,
            regId: null,
            regDept: null,
            regName: null,
            otp: null,
            updatedAt: Date.now(),
        };
    }
    return sessions[phone];
}

// ── Set session field(s) ──────────────────
function updateSession(phone, updates) {
    const session = getSession(phone);
    Object.assign(session, updates, { updatedAt: Date.now() });
    return session;
}

// ── Set stage ─────────────────────────────
function setStage(phone, stage) {
    return updateSession(phone, { stage });
}

// ── Link user to session after registration ──
function setUser(phone, user) {
    return updateSession(phone, {
        user,
        stage: STAGES.IDLE,
    });
}

// ── Reset to idle (clear pending data) ────
function resetToIdle(phone) {
    return updateSession(phone, {
        stage: STAGES.IDLE,
        pendingQuery: null,
        pendingIntent: null,
        pendingFormat: null,
        pendingDept: null,
        pendingReportType: null,
        regRole: null,
        regId: null,
        regDept: null,
        regName: null,
        otp: null,
    });
}

// ── Clear session entirely ────────────────
function clearSession(phone) {
    delete sessions[phone];
}

// ── Cleanup stale sessions (>4 hours) ─────
function cleanupStaleSessions() {
    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;

    for (const phone of Object.keys(sessions)) {
        if (now - sessions[phone].updatedAt > FOUR_HOURS) {
            delete sessions[phone];
            cleaned++;
        }
    }

    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} stale sessions`);
    }
}

// Cleanup every hour
setInterval(cleanupStaleSessions, 60 * 60 * 1000);

module.exports = {
    STAGES,
    getSession,
    updateSession,
    setStage,
    setUser,
    resetToIdle,
    clearSession,
};
