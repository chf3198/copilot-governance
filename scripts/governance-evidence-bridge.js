#!/usr/bin/env node
'use strict';
// #3014 — auto-bridge baton artifacts into governance-fields snapshot for HAMR bundles.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { entries: batonEntries } = require('./baton-artifact-governance');
const { ROLE_FIELD_KEYS } = require('./governance-bundle-fields');

const FIELD_RE = {
  checks_run: /checks_run:\s*(\d+)/i,
  checks_failed: /checks_failed:\s*(\d+)/i,
  cross_family_rating: /cross_family_rating:\s*(\d+)/i,
  test_strategy: /test_strategy:\s*(\S+)/i,
  branch: /branch:\s*(\S+)/i,
  commit: /commit:\s*([0-9a-f]{7,40})/i,
  pr_url: /pr_url:\s*(\S+)/i,
  ci_green: /ci_green:\s*(true|false)/i,
  verdict: /verdict:\s*(\S+)/i,
  rubric_rating: /rubric_rating:\s*(\d+)/i,
  drift_score: /drift_score:\s*(\d+)/i,
  fleet_utilization: /fleet_utilization:\s*(\S+)/i,
  wiki_health: /wiki_health:\s*(\S+)/i,
};

function extractField(body, key) {
  const m = (body || '').match(FIELD_RE[key]);
  if (!m) return undefined;
  if (key === 'checks_run' || key === 'checks_failed' || key === 'cross_family_rating' || key === 'rubric_rating' || key === 'drift_score') return Number(m[1]);
  if (key === 'ci_green') return m[1] === 'true';
  return m[1];
}

// 24h freshness window for a governance-fields snapshot (AC2). A snapshot older than this is stale.
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// Canonical content hash over the identity-bearing fields ({issue, fields, generated_at}) — the SAME
// derivation bridgeFromComments stamps, so recomputing it detects any post-hoc edit to a
// governance-fields JSON (AC2 parity / tamper detection).
function computeContentHash(snapshot) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ issue: snapshot.issue, fields: snapshot.fields, generated_at: snapshot.generated_at }))
    .digest('hex');
}

function bridgeFromComments(issue, comments, nowMs = Date.now()) {
  const byRole = {};
  for (const e of batonEntries(comments || [])) {
    byRole[e.role] = byRole[e.role] || {};
    for (const key of ROLE_FIELD_KEYS[e.role] || []) {
      const val = extractField(e.body, key);
      if (val !== undefined) byRole[e.role][key] = val;
    }
  }
  const flat = {};
  for (const role of Object.keys(byRole)) Object.assign(flat, byRole[role]);
  const payload = { schema: 'governance-fields/v2', issue: Number(issue), roles: byRole, fields: flat, generated_at: new Date(nowMs).toISOString() };
  payload.content_hash = computeContentHash(payload);
  return payload;
}

// AC2 — content-hash parity. Recompute and compare; ok:false means the snapshot's fields or
// generated_at were altered after it was stamped (or the hash is missing).
function verifyParity(snapshot) {
  const expected = computeContentHash(snapshot);
  return { ok: expected === snapshot.content_hash, expected, actual: snapshot.content_hash };
}

// AC2 — freshness TTL. A snapshot whose generated_at is older than ttlMs is stale; an unparseable
// timestamp is treated as stale (fail-safe — a snapshot we cannot date must not be trusted as fresh).
function isStale(snapshot, { ttlMs = DEFAULT_TTL_MS, nowMs = Date.now() } = {}) {
  const gen = Date.parse(snapshot && snapshot.generated_at);
  if (Number.isNaN(gen)) return true;
  return (nowMs - gen) > ttlMs;
}

// AC3 — evidence completeness across role gates. For each required role, report which of its
// ROLE_FIELD_KEYS are present in the bridged snapshot. `requiredRoles` gates a staged issue against the
// roles that MUST have reported (default: the roles actually present in the snapshot).
function evaluateCompleteness(snapshot, { requiredRoles } = {}) {
  const roles = requiredRoles || Object.keys((snapshot && snapshot.roles) || {});
  const perRole = {};
  let complete = true;
  for (const role of roles) {
    const required = ROLE_FIELD_KEYS[role] || [];
    const present = (snapshot && snapshot.roles && snapshot.roles[role]) || {};
    const missing = required.filter((k) => present[k] === undefined);
    perRole[role] = { required: required.length, present: required.length - missing.length, missing };
    if (missing.length) complete = false;
  }
  return { complete, roles: perRole };
}

// AC4 — diagnostics: actionable findings for parity failure, staleness, and missing role fields.
function diagnose(snapshot, opts = {}) {
  const findings = [];
  const parity = verifyParity(snapshot);
  if (!parity.ok) {
    findings.push({
      code: 'EB_PARITY', severity: 'high',
      message: `content_hash parity failed (expected ${parity.expected.slice(0, 12)}…, got ${String(parity.actual).slice(0, 12)}…)`,
      remediation: 'Regenerate via writeSnapshot — never hand-edit a governance-fields JSON.',
    });
  }
  if (isStale(snapshot, opts)) {
    findings.push({
      code: 'EB_STALE', severity: 'medium',
      message: `snapshot generated_at ${snapshot && snapshot.generated_at} exceeds the freshness TTL`,
      remediation: 'Re-run the evidence bridge after the latest baton comment.',
    });
  }
  const comp = evaluateCompleteness(snapshot, opts);
  for (const [role, r] of Object.entries(comp.roles)) {
    for (const field of r.missing) {
      findings.push({
        code: 'EB_MISSING_FIELD', severity: 'medium', role, field,
        message: `role '${role}' is missing governance field '${field}'`,
        remediation: `Post the ${role} baton artifact with '${field}: <value>'.`,
      });
    }
  }
  return { ok: findings.length === 0, findings };
}

function writeSnapshot(issue, comments, root = process.cwd()) {
  const snap = bridgeFromComments(issue, comments);
  const out = path.join(os.homedir(), '.megingjord', `governance-fields-${issue}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snap, null, 2) + '\n', 'utf8');
  return { path: out, snapshot: snap };
}

module.exports = {
  bridgeFromComments, writeSnapshot, extractField,
  computeContentHash, verifyParity, isStale, evaluateCompleteness, diagnose,
  DEFAULT_TTL_MS,
};

// --verify <snapshotPath> [--roles a,b,c] — read a governance-fields JSON and print its diagnosis
// (parity, freshness, completeness). Advisory: always exits 0; hermetic (fs only, no network).
if (require.main === module) {
  const args = process.argv.slice(2);
  const vi = args.indexOf('--verify');
  if (vi === -1 || !args[vi + 1]) {
    process.stderr.write('usage: governance-evidence-bridge.js --verify <snapshot.json> [--roles manager,collaborator,admin,consultant]\n');
    process.exit(0);
  }
  const rolesArg = args.indexOf('--roles');
  const requiredRoles = rolesArg !== -1 && args[rolesArg + 1]
    ? args[rolesArg + 1].split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  let snap;
  try { snap = JSON.parse(fs.readFileSync(args[vi + 1], 'utf8')); }
  catch (e) { process.stdout.write(`${JSON.stringify({ ok: false, error: `unreadable snapshot: ${e.message}` })}\n`); process.exit(0); }
  process.stdout.write(`${JSON.stringify(diagnose(snap, { requiredRoles }), null, 2)}\n`);
  process.exit(0);
}
