// ─────────────────────────────────────────
//  src/rag/vectorStore.js
//  Local JSON vector database
//  Supports dept-scoped retrieval for role-based access
// ─────────────────────────────────────────
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

const STORE_PATH = process.env.VECTOR_STORE_PATH || './data/vectorstore.json';

let store = null; // in-memory cache

// ── Load store from disk ──────────────────
function loadStore() {
  if (store) return store;
  if (fs.existsSync(STORE_PATH)) {
    store = fs.readJsonSync(STORE_PATH);
    logger.info(`Vector store loaded: ${store.chunks.length} chunks`);
  } else {
    store = { chunks: [], deptMeta: {} };
    logger.info('New vector store created');
  }
  // Ensure deptMeta exists
  if (!store.deptMeta) store.deptMeta = {};
  return store;
}

// ── Save store to disk ────────────────────
function saveStore() {
  fs.outputJsonSync(STORE_PATH, store);
  logger.success(`Vector store saved: ${store.chunks.length} total chunks`);
}

// ── Add chunks for a department (replaces existing) ──
async function addDeptData(embeddedChunks, dept, meta) {
  loadStore();

  // Remove old chunks for this dept + record type
  const recordType = meta.recordType; // e.g. 'master', 'attendance', 'results'
  const before = store.chunks.length;

  if (recordType) {
    store.chunks = store.chunks.filter(
      c => !(c.metadata?.dept === dept && c.metadata?.recordType === recordType)
    );
  } else {
    store.chunks = store.chunks.filter(c => c.metadata?.dept !== dept);
  }

  const removed = before - store.chunks.length;
  if (removed > 0) logger.warn(`Replaced ${removed} old chunks for ${dept}`);

  embeddedChunks.forEach(chunk => {
    store.chunks.push({
      id: chunk.id,
      text: chunk.text,
      embedding: chunk.embedding,
      metadata: { ...chunk.metadata, ...meta, dept },
    });
  });

  // Update dept metadata
  store.deptMeta[dept] = {
    lastUpload: new Date().toISOString(),
    uploadedBy: meta.uploadedBy,
    studentCount: meta.studentCount || 0,
    chunkCount: embeddedChunks.length,
  };

  saveStore();
  logger.success(`Added ${embeddedChunks.length} chunks for dept ${dept}`);
}

// ── Legacy: add generic document to store ──
async function addDocumentToStore(embeddedChunks, docMeta) {
  loadStore();
  const filename = docMeta.filename;
  store.chunks = store.chunks.filter(c => c.metadata?.filename !== filename);

  embeddedChunks.forEach(chunk => {
    store.chunks.push({
      id: chunk.id,
      text: chunk.text,
      embedding: chunk.embedding,
      metadata: { ...chunk.metadata, ...docMeta },
    });
  });
  saveStore();
}

// ── Get ALL chunks ────────────────────────
function getAllChunks() {
  loadStore();
  return store.chunks;
}

// ── Get chunks for a specific department ──
function getDeptChunks(dept) {
  loadStore();
  if (!dept || dept === 'ALL') return store.chunks;
  return store.chunks.filter(c => c.metadata?.dept === dept);
}

// ── Get chunks by dept + record type ─────
function getDeptChunksByType(dept, recordType) {
  loadStore();
  return store.chunks.filter(
    c => c.metadata?.dept === dept && c.metadata?.recordType === recordType
  );
}

// ── Get chunks for a specific user (legacy) ──
function getUserChunks(phoneNumber) {
  loadStore();
  const userChunks = store.chunks.filter(c => c.metadata?.from === phoneNumber);
  return userChunks.length > 0 ? userChunks : store.chunks;
}

// ── Get dept metadata ─────────────────────
function getDeptMeta(dept) {
  loadStore();
  return store.deptMeta?.[dept] || null;
}

// ── Get list of depts that have data ─────
function getUploadedDepts() {
  loadStore();
  return Object.keys(store.deptMeta || {});
}

// ── Clear store ───────────────────────────
function clearStore() {
  store = { chunks: [], deptMeta: {} };
  saveStore();
  logger.warn('Vector store cleared!');
}

module.exports = {
  addDeptData,
  addDocumentToStore,
  getAllChunks,
  getDeptChunks,
  getDeptChunksByType,
  getUserChunks,
  getDeptMeta,
  getUploadedDepts,
  clearStore,
};