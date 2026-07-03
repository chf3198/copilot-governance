#!/usr/bin/env node
// log-redaction.js — PII/secret redaction for harness logs.
// Epic #1339 / #1358. Implements R&D Thread 5 "prevent at instrumentation"
// strategy. Patterns in config/redaction-patterns.json.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PATTERNS_FILE = path.join(__dirname, '..', '..', 'config', 'redaction-patterns.json');

function loadPatterns(file = PATTERNS_FILE) {
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (data.patterns || []).map(pattern => ({
    ...pattern,
    compiled: new RegExp(pattern.regex, 'g'),
  }));
}

let _patterns = null;
function getPatterns() {
  if (_patterns === null) _patterns = loadPatterns();
  return _patterns;
}

/**
 * Apply redaction patterns to a single string.
 * @param {string} input
 * @param {Array}  patterns  optional override
 * @returns {{ text: string, hits: Array<{id, action}> }}
 */
function redactString(input, patterns = getPatterns()) {
  if (typeof input !== 'string') return { text: input, hits: [] };
  let text = input;
  const hits = [];
  for (const pattern of patterns) {
    pattern.compiled.lastIndex = 0;
    if (!pattern.compiled.test(text)) continue;
    pattern.compiled.lastIndex = 0;
    text = text.replace(pattern.compiled, (match) => {
      hits.push({ id: pattern.id, action: pattern.action });
      if (pattern.action === 'redact') return pattern.replacement || '<REDACTED>';
      if (pattern.action === 'hash') return `<HASH:${hashShort(match)}>`;
      if (pattern.action === 'drop') return '';
      return match;
    });
  }
  return { text, hits };
}

function hashShort(input) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 12);
}

/**
 * Apply redaction to a structured event (recursive over string fields).
 * Returns the redacted event + aggregated hits.
 * @param {object} event
 * @param {Array}  patterns
 * @returns {{ event: object, hits: Array }}
 */
function redactEvent(event, patterns = getPatterns()) {
  const allHits = [];
  function walk(node) {
    if (typeof node === 'string') {
      const result = redactString(node, patterns);
      allHits.push(...result.hits);
      return result.text;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out = {};
      for (const key of Object.keys(node)) out[key] = walk(node[key]);
      return out;
    }
    return node;
  }
  return { event: walk(event), hits: allHits };
}

/**
 * Wrap a write function so that any object passed through it is redacted first.
 * Used at instrumentation site (prevent, not scrub).
 * @param {function} writeFn  receives the (redacted) event
 * @returns {function} new write fn
 */
function wrapWrite(writeFn) {
  const patterns = getPatterns();
  return function wrappedWrite(event) {
    const result = redactEvent(event, patterns);
    return writeFn(result.event);
  };
}

/**
 * Pre-LLM-consumption redaction hook. When log content is being included in
 * an LLM prompt (high-risk for prompt injection via leaked secrets), pass
 * through this hook first.
 * @param {string} promptFragment
 * @returns {string}
 */
function sanitizeForLLM(promptFragment) {
  return redactString(promptFragment, getPatterns()).text;
}

module.exports = {
  loadPatterns, getPatterns, redactString, redactEvent,
  wrapWrite, sanitizeForLLM, hashShort, PATTERNS_FILE,
};
