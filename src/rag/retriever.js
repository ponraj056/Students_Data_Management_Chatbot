// ─────────────────────────────────────────
//  src/rag/retriever.js
//  Department-scoped cosine similarity search
//  Role-based filtering: ADMIN=all, HOD/FAC=own dept
// ─────────────────────────────────────────
const { embedQuery } = require('./embedder');
const { getAllChunks, getDeptChunks } = require('./vectorStore');
const logger = require('../utils/logger');

const TOP_K = parseInt(process.env.TOP_K_RESULTS) || 5;

// ── Cosine similarity ─────────────────────
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Retrieve for a registered user ───────
// Scopes search to user's accessible departments
async function retrieveForUser(query, user, options = {}) {
  logger.rag(`Searching: "${query}" | User: ${user?.empId} | Role: ${user?.role}`);

  const queryEmbedding = await embedQuery(query);

  // Determine which chunks this user can search
  let chunks;
  if (!user || user.role === 'ADMIN') {
    chunks = getAllChunks();
  } else {
    chunks = getDeptChunks(user.department);
  }

  // Optional: filter by dept override (Admin choosing a specific dept)
  if (options.dept) {
    chunks = chunks.filter(c => c.metadata?.dept === options.dept);
  }

  // Optional: filter by record type
  if (options.recordType) {
    chunks = chunks.filter(c => c.metadata?.recordType === options.recordType);
  }

  if (chunks.length === 0) {
    logger.warn('No chunks found for this user/dept');
    return [];
  }

  logger.info(`Searching through ${chunks.length} chunks...`);

  const scored = chunks
    .filter(c => c.embedding && Array.isArray(c.embedding))
    .map(chunk => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

  scored.sort((a, b) => b.score - a.score);

  const topK = options.topK || TOP_K;
  const top = scored.slice(0, topK);

  logger.success(
    `Found ${top.length} relevant chunks ` +
    `(best: ${top[0]?.score?.toFixed(3) || 'N/A'})`
  );

  return top;
}

// ── Legacy: retrieve by phone ─────────────
async function retrieveRelevantChunks(query, phoneNumber = null) {
  logger.rag(`Legacy search: "${query}"`);
  const queryEmbedding = await embedQuery(query);
  const chunks = getAllChunks();

  if (chunks.length === 0) return [];

  const scored = chunks
    .filter(c => c.embedding)
    .map(chunk => ({ ...chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, TOP_K);
}

module.exports = { retrieveForUser, retrieveRelevantChunks };