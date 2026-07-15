'use strict';
// prompt-budget — enforce per-model prompt-payload budgets with RAG/chunking fallback.
// Refs Epic #2150 #2204. Composes with Epic #2041 #2181 expected_token_range schema.

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_POLICY_PATH = path.join(__dirname, '..', '..', 'config', 'prompt-budget-policy.json');
const CHAR_PER_TOKEN_APPROX = 4;
const DEFAULT_RAG_TRIGGER_CHARS = 80000;
const DEFAULT_CHUNK_OVERLAP_CHARS = 400;

function loadPolicy(policyPath = DEFAULT_POLICY_PATH) {
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
}

function modelBudget(model, policy) {
  if (model && policy.models && policy.models[model]) return policy.models[model];
  return policy.default;
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / CHAR_PER_TOKEN_APPROX);
}

function chunkPrompt(prompt, maxChunkChars, overlapChars) {
  const chunks = [];
  let cursor = 0;
  const text = String(prompt || '');
  while (cursor < text.length) {
    const end = Math.min(cursor + maxChunkChars, text.length);
    chunks.push(text.slice(cursor, end));
    if (end >= text.length) break;
    cursor = end - overlapChars;
    if (cursor < 0) cursor = 0;
  }
  return chunks;
}

function enforcePromptBudget({ prompt, model, templateBudget, policy } = {}) {
  const policyObj = policy || loadPolicy();
  const budget = modelBudget(model, policyObj);
  const tokens = estimateTokens(prompt);
  const effectiveCap = Math.min(budget.prompt_cap_tokens, templateBudget || Infinity);
  if (tokens <= effectiveCap) {
    return { ok: true, tokens, cap: effectiveCap, action: 'pass-through' };
  }
  const rag = policyObj.rag_fallback || {};
  if (String(prompt || '').length >= (rag.trigger_chars || DEFAULT_RAG_TRIGGER_CHARS)) {
    return { ok: false, tokens, cap: effectiveCap, action: 'rag-fallback', reason: `prompt exceeds rag_fallback.trigger_chars (${rag.trigger_chars}); recommend retrieval-augmented chunking` };
  }
  const charsPerChunk = effectiveCap * CHAR_PER_TOKEN_APPROX;
  const chunks = chunkPrompt(prompt, charsPerChunk, rag.chunk_overlap_chars || DEFAULT_CHUNK_OVERLAP_CHARS);
  if (rag.max_chunks && chunks.length > rag.max_chunks) {
    return { ok: false, tokens, cap: effectiveCap, action: 'rag-fallback', reason: `chunk count ${chunks.length} > rag_fallback.max_chunks ${rag.max_chunks}` };
  }
  return { ok: true, tokens, cap: effectiveCap, action: 'chunked', chunks };
}

module.exports = { enforcePromptBudget, modelBudget, estimateTokens, chunkPrompt, loadPolicy, DEFAULT_POLICY_PATH };
