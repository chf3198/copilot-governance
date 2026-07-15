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
  payload.content_hash = crypto.createHash('sha256').update(JSON.stringify({ issue: payload.issue, fields: flat, generated_at: payload.generated_at })).digest('hex');
  return payload;
}

function writeSnapshot(issue, comments, root = process.cwd()) {
  const snap = bridgeFromComments(issue, comments);
  const out = path.join(os.homedir(), '.megingjord', `governance-fields-${issue}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snap, null, 2) + '\n', 'utf8');
  return { path: out, snapshot: snap };
}

module.exports = { bridgeFromComments, writeSnapshot, extractField };
