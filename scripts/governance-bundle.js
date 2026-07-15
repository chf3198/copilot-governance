#!/usr/bin/env node
'use strict';
// tier: 3
// Governance bundle for fleet-model consultant parity (Epic #2094 Phase-1,
// Option C bundle-first). The orchestrator precomputes a redacted, content-
// hashed bundle of the governance fields a Consultant CLOSEOUT requires, so a
// fleet model (Ollama via HAMR) can populate a compliant CLOSEOUT WITHOUT live
// access to local orchestrator tools. Integrity: sha256 content_hash anchor +
// HAMR transport auth (DPoP + SLSA on /mcp). Privacy (G4): positive field
// allow-list + log-redaction; raw diffs/tokens/issue-bodies never included.
const crypto = require('node:crypto');
const { redactEvent } = require('./log-redaction');
const { ALL_KEYS } = require('./governance-bundle-fields');

// 300s default: fast/volatile fields (PR checks, issue trail) must be recent.
const FAST_TTL_MS = Number(process.env.GOVERNANCE_BUNDLE_FAST_TTL_MS || 300000);
// The only fields ever emitted (allow-list). Mirrors role-consultant-critique
// mandatory CLOSEOUT fields.
const FIELD_KEYS = [
  'checks_run', 'checks_failed', 'drift_score',
  'fleet_utilization', 'rubric_rating', 'wiki_health',
  // Epic #3391 B3: operator-autonomy dimension (cross-cutting principle scored on closeouts).
  'autonomy_score',
];

function canonicalFields(fields) {
  const out = {};
  const keys = fields && fields.schema === 'governance-fields/v2' ? ALL_KEYS : FIELD_KEYS;
  const src = fields && fields.fields ? fields.fields : fields;
  for (const k of keys) if (src && src[k] !== undefined) out[k] = src[k];
  return out;
}

function contentHash(fields, issue, generatedAt) {
  const canon = JSON.stringify({ issue, fields: canonicalFields(fields), generated_at: generatedAt });
  return crypto.createHash('sha256').update(canon).digest('hex');
}

function buildBundle({ issue, fields, nowMs }) {
  const generatedAt = new Date(nowMs).toISOString();
  const redacted = redactEvent(canonicalFields(fields || {})).event;
  const schema = (fields && fields.schema === 'governance-fields/v2') ? 'governance-bundle/v2' : 'governance-bundle/v1';
  const bundle = { schema, issue: Number(issue), fields: redacted, generated_at: generatedAt };
  bundle.content_hash = contentHash(redacted, bundle.issue, generatedAt);
  return bundle;
}

function verifyHash(bundle) {
  if (!bundle || !bundle.content_hash) return false;
  return bundle.content_hash === contentHash(bundle.fields || {}, bundle.issue, bundle.generated_at);
}

function isFresh(bundle, nowMs, fastTtlMs = FAST_TTL_MS) {
  if (!bundle || !bundle.generated_at) return false;
  const age = nowMs - new Date(bundle.generated_at).getTime();
  return age >= 0 && age <= fastTtlMs;
}

// C2 parity: a fleet-authored CLOSEOUT is valid iff it cites a bundle hash that
// matches a hash-valid, fast-TTL-fresh bundle. Same standard as a non-fleet
// CLOSEOUT — a provenance check, not a separate bar.
function fleetCloseoutParity(closeoutBody, bundle, nowMs, fastTtlMs = FAST_TTL_MS) {
  const cited = ((closeoutBody || '').match(/governance-bundle-hash:\s*([0-9a-f]{64})/i) || [])[1];
  if (!cited) return { ok: false, reason: 'no-bundle-hash-cited' };
  if (!verifyHash(bundle)) return { ok: false, reason: 'bundle-hash-invalid' };
  if (cited.toLowerCase() !== bundle.content_hash) return { ok: false, reason: 'hash-mismatch' };
  if (!isFresh(bundle, nowMs, fastTtlMs)) return { ok: false, reason: 'bundle-stale-fast-ttl' };
  return { ok: true, reason: 'fleet-parity-ok' };
}

module.exports = {
  FIELD_KEYS, FAST_TTL_MS, canonicalFields, contentHash,
  buildBundle, verifyHash, isFresh, fleetCloseoutParity,
};

if (require.main === module) {
  const fs = require('node:fs');
  const [, , issue, fieldsPath] = process.argv;
  const fields = fieldsPath ? JSON.parse(fs.readFileSync(fieldsPath, 'utf8')) : {};
  process.stdout.write(`${JSON.stringify(buildBundle({ issue, fields, nowMs: Date.now() }))}\n`);
}
