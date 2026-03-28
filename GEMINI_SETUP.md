# 🔑 Gemini AI Setup Guide

## Step 1 — Get Your FREE Gemini API Key

```
1. Go to:  https://aistudio.google.com
2. Sign in with your Google account
3. Click "Get API Key" (top left button)
4. Click "Create API key in new project"
5. Copy the key (starts with "AIzaSy...")
```

✅ No credit card needed
✅ Free limits: 15 requests/min, 1 million tokens/day

---

## Step 2 — Paste Into Your .env

```dotenv
GEMINI_API_KEY=AIzaSy_paste_your_key_here
```

---

## Models Used in This Project

### 1. `text-embedding-004` — For Embeddings
- Converts document chunks into 768-number vectors
- taskType RETRIEVAL_DOCUMENT → for storing chunks
- taskType RETRIEVAL_QUERY    → for user questions
- Gemini optimizes each differently for better search accuracy

### 2. `gemini-1.5-flash` — For Answers & Data Extraction
- Reads retrieved chunks + question → writes precise answer
- Also used to extract structured JSON data for Excel sheets
- Temperature 0.1 for factual answers
- Temperature 0.0 for structured JSON extraction

---

## How Gemini Understands Your Documents

```
Document Chunk (text)
        ↓
[text-embedding-004]  ← "What does this text mean?"
        ↓
[0.23, -0.45, 0.67 ... × 768]  ← 768 numbers = the "meaning"
        ↓
Stored in Vector Database

User asks: "What is the invoice total?"
        ↓
[text-embedding-004]  ← "What is this question asking for?"
        ↓
[0.24, -0.44, 0.66 ... × 768]  ← very close to invoice chunks!
        ↓
Cosine similarity → finds matching chunks
        ↓
[gemini-1.5-flash]  ← "Read these chunks, answer the question"
        ↓
"The invoice total is $4,250 as stated in invoice.pdf"
```

---

## Free Tier Limits (as of 2025)

| Model | Requests/min | Tokens/day | Cost |
|-------|-------------|------------|------|
| gemini-1.5-flash | 15 RPM | 1,000,000 | FREE |
| text-embedding-004 | 1500 RPM | Unlimited | FREE |

For a WhatsApp business bot with moderate usage, these limits are more than sufficient.
