// ─────────────────────────────────────────
//  src/utils/roleChecker.js
//  Role-based access control
//
//  ADMIN   → Upload ✅  View ✅  Update ✅
//  HOD     → Upload ❌  View ✅  Update ✅
//  FACULTY → Upload ❌  View ✅  Update ✅
//  STUDENT → Upload ❌  View ✅  Update ❌
// ─────────────────────────────────────────
const fs = require('fs-extra');
const logger = require('./logger');

const USERS_FILE = process.env.USERS_FILE || './data/users.json';

// ── Load users ────────────────────────────
function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.outputJsonSync(USERS_FILE, { users: [] });
      return { users: [] };
    }
    return fs.readJsonSync(USERS_FILE);
  } catch (err) {
    logger.error('Failed to load users.json: ' + err.message);
    return { users: [] };
  }
}

// ── Save users ────────────────────────────
function saveUsers(data) {
  try {
    fs.outputJsonSync(USERS_FILE, data, { spaces: 2 });
  } catch (err) {
    logger.error('Failed to save users.json: ' + err.message);
  }
}

// ── Get user by phone ─────────────────────
function getUserByPhone(phone) {
  const adminPhones = (process.env.ADMIN_PHONE || '').split(',').map(p => p.trim());
  if (adminPhones.includes(phone)) {
    return {
      phone: phone,
      empId: 'ADMIN-001',
      name: 'Principal/Admin',
      role: 'ADMIN',
      department: 'ALL'
    };
  }
  const data = loadUsers();
  return data.users.find(u => u.phone === phone) || null;
}

// ── Get user by empId ─────────────────────
function getUserByEmpId(empId) {
  const data = loadUsers();
  const id = empId.trim().toUpperCase();
  return data.users.find(u => u.empId.toUpperCase() === id) || null;
}

// ── Is phone registered ───────────────────
function isRegistered(phone) {
  const adminPhones = (process.env.ADMIN_PHONE || '').split(',').map(p => p.trim());
  if (adminPhones.includes(phone)) return true;
  return !!(getUserByPhone(phone));
}

// ── Register phone → empId ────────────────
function registerUser(phone, empId) {
  const data = loadUsers();
  const id = empId.trim().toUpperCase();
  const idx = data.users.findIndex(u => u.empId.toUpperCase() === id);

  if (idx === -1) return null;

  const existing = data.users[idx];
  if (existing.phone && existing.phone !== phone) {
    logger.warn(`Re-registering ${id}: ${existing.phone} → ${phone}`);
  }

  data.users[idx].phone = phone;
  data.users[idx].registeredAt = new Date().toISOString();
  saveUsers(data);

  logger.success(`Registered ${phone} as ${id} (${existing.role}/${existing.department})`);
  return data.users[idx];
}

// ── Register Student ──────────────────────
function registerStudent(phone, rollNo, dept, name) {
  const data = loadUsers();
  const existingIdx = data.users.findIndex(u => u.empId.toUpperCase() === rollNo.toUpperCase());

  const studentData = {
    phone: phone,
    empId: rollNo.toUpperCase(),
    name: name,
    role: 'STUDENT',
    department: dept.toUpperCase(),
    registeredAt: new Date().toISOString()
  };

  if (existingIdx !== -1) {
    data.users[existingIdx] = studentData; // Update existing
  } else {
    data.users.push(studentData);
  }

  saveUsers(data);
  logger.success(`Registered Student ${phone} as ${rollNo} (${dept})`);
  return studentData;
}

// ─────────────────────────────────────────
//  PERMISSION CHECKS
// ─────────────────────────────────────────

// Can this user UPLOAD Excel files?

function canUpload(user) {
  if (!user) return false;
  return ['ADMIN', 'HOD', 'FACULTY'].includes(user.role);
}

// Can this user UPDATE student records?
// ADMIN, HOD, FACULTY — everyone except STUDENT
function canUpdate(user) {
  if (!user) return false;
  return ['ADMIN', 'HOD', 'FACULTY'].includes(user.role);
}

// Can this user VIEW data?
// Everyone can view
function canView(user) {
  if (!user) return false;
  return ['ADMIN', 'HOD', 'FACULTY', 'STUDENT'].includes(user.role);
}

// Can this user access a specific dept?
function canAccessDept(user, dept) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (!dept) return true;
  return user.department.toUpperCase() === dept.toUpperCase();
}

// Get accessible departments
function getAccessibleDepts(user) {
  if (!user) return [];
  if (user.role === 'ADMIN') return 'ALL';
  return [user.department];
}

// Role display label
function getRoleLabel(role) {
  const labels = {
    ADMIN: '🌐 Administrator',
    HOD: '🎓 Head of Department',
    FACULTY: '👨‍🏫 Faculty',
    STUDENT: '🎒 Student',
  };
  return labels[role] || role;
}

module.exports = {
  getUserByPhone,
  getUserByEmpId,
  isRegistered,
  registerUser,
  registerStudent,
  canUpload,
  canUpdate,
  canView,
  canAccessDept,
  getAccessibleDepts,
  getRoleLabel,
};