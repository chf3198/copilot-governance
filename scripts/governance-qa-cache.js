#!/usr/bin/env node
'use strict';
// governance-qa-cache.js (#3142, Epic #3137 T4): cache answers to repeated governance Q&A so a
// repeated question is a cache HIT, not a re-inference (saves tokens on both lanes). Key = the
// reused memory-dedup-lint normalizeKey + a full-content sha256 suffix (so same-prefix questions do
// not collide). Bounded store; resilient. Deterministic; no embeddings (cosine version deferred).
// Local, $0.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeKey } = require('./memory-dedup-lint');

const MAX_ENTRIES = 500;
const HASH_LEN = 12;
const DEFAULT_STORE = path.join(
  process.env.HOME || '/tmp',
  '.megingjord',
  'governance-qa-cache.json'
);

/** Cache key: normalized prefix + full-content hash (collision-safe). @param {string} question @returns {string} */
function cacheKey(question) {
  const normalized = question.trim().toLowerCase().replace(/\s+/g, ' ');
  const full = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, HASH_LEN);
  return `${normalizeKey(question)}|${full}`;
}

/** Load the store (resilient: absent/corrupt -> {}). @param {string} file @returns {object} */
function loadStore(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/** Persist the store, bounded to MAX_ENTRIES (drop oldest). @param {string} file @param {object} store @returns {void} */
function saveStore(file, store) {
  const keys = Object.keys(store);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete store[key];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store));
}

/** Cache lookup for a governance question (miss -> null). @param {string} question @param {string} [file] @returns {string|null} */
function get(question, file = DEFAULT_STORE) {
  if (!question) return null;
  const entry = loadStore(file)[cacheKey(question)];
  return entry ? entry.answer : null;
}

/** Cache a question/answer pair (bounded, recency-ordered). @param {string} question @param {string} answer @param {string} [file] @returns {boolean} */
function put(question, answer, file = DEFAULT_STORE) {
  if (!question || typeof answer !== 'string') return false;
  const store = loadStore(file);
  const key = cacheKey(question);
  delete store[key];
  store[key] = { answer, ts: new Date().toISOString() };
  saveStore(file, store);
  return true;
}

function main() {
  process.stdout.write(
    'governance-qa-cache: get(q)/put(q,a) — normalized-hash keyed, bounded, deterministic, $0.\n'
  );
}

if (require.main === module) main();
module.exports = { get, put, cacheKey, loadStore, DEFAULT_STORE };
