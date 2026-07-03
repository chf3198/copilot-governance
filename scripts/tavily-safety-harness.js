#!/usr/bin/env node
'use strict';

const { redactString } = require('./log-redaction');

const INJECTION_RE = /ignore\s+previous|system\s+prompt|developer\s+message|exfiltrat|tool\s+call|override\s+policy/i;
const MAX_QUERY_LEN = 240;

/** @param {string} query @returns {string} */
function minimizeQuery(query) {
  return String(query || '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LEN);
}

/** @param {string} query @returns {{query:string, hits:Array}} */
function redactQuery(query) {
  const out = redactString(minimizeQuery(query));
  return { query: out.text, hits: out.hits || [] };
}

/** @param {string} text @returns {{unsafe:boolean, reason:string|null}} */
function detectPromptInjection(text) {
  const textValue = String(text || '');
  const unsafe = INJECTION_RE.test(textValue);
  return { unsafe, reason: unsafe ? 'prompt-injection-pattern' : null };
}

/** @param {{retentionDays?:number, policyUrl?:string}} meta @returns {{ok:boolean, reason:string|null}} */
function assertRetention(meta = {}) {
  const days = Number(meta.retentionDays ?? 0);
  if (!Number.isFinite(days) || days <= 0) return { ok: false, reason: 'missing-retention' };
  if (days > 30) return { ok: false, reason: 'retention-too-long' };
  if (!meta.policyUrl) return { ok: false, reason: 'missing-policy-url' };
  return { ok: true, reason: null };
}

/** @param {Array<{claim:string,citation?:{url?:string,id?:string}}>} claims */
function assertCitationProvenance(claims = []) {
  const invalid = claims.filter((c) => !(c?.citation?.url && c?.citation?.id));
  return { ok: invalid.length === 0, invalidCount: invalid.length };
}

module.exports = {
  minimizeQuery,
  redactQuery,
  detectPromptInjection,
  assertRetention,
  assertCitationProvenance,
};
