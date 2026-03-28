// ─────────────────────────────────────────
//  src/rag/embedder.js
//  Converts text chunks to vectors
//  Using Cohere Embeddings API (FREE)
//
//  WHY COHERE?
//  - 100% free tier
//  - No local model = no memory crash
//  - 1024 dimensions (very accurate)
//  - Simple HTTP API like Groq
// ─────────────────────────────────────────
const { CohereClient } = require('cohere-ai');
const logger = require('../utils/logger');

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

// Process chunks in small batches
// Cohere free tier: 100 calls/minute
const BATCH_SIZE = 10;

/**
 * Embed document chunks for storage.
 * inputType 'search_document' = optimized for storing
 */
async function embedChunks(chunks) {
  logger.rag(`Embedding ${chunks.length} chunks with Cohere...`);
  const embedded = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.text);

    const response = await cohere.embed({
      texts,
      model: 'embed-english-v3.0', // Free tier model
      inputType: 'search_document', // For storing chunks
    });

    batch.forEach((chunk, idx) => {
      embedded.push({
        ...chunk,
        embedding: response.embeddings[idx],
      });
    });

    logger.success(`Embedded batch ${Math.floor(i / BATCH_SIZE) + 1} — ${batch.length} chunks`);

    // Small delay between batches for rate limit
    if (i + BATCH_SIZE < chunks.length) {
      await sleep(300);
    }
  }

  logger.success(`All ${embedded.length} chunks embedded! (1024 dims each)`);
  return embedded;
}

/**
 * Embed a single user query for searching.
 * inputType 'search_query' = optimized for questions
 */
async function embedQuery(queryText) {
  logger.rag(`Embedding query: "${queryText.substring(0, 50)}..."`);

  const response = await cohere.embed({
    texts: [queryText],
    model: 'embed-english-v3.0',
    inputType: 'search_query', // For user questions
  });

  return response.embeddings[0];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { embedChunks, embedQuery };