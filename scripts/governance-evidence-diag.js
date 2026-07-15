#!/usr/bin/env node
'use strict';
// #3014 — diagnostics for missing/stale governance evidence fields.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROLE_FIELD_KEYS } = require('./governance-bundle-fields');
const { bridgeFromComments } = require('./governance-evidence-bridge');
const { isFresh } = require('./governance-bundle');

function diagnoseEvidence(issue, comments, nowMs = Date.now()) {
  const bridged = bridgeFromComments(issue, comments, nowMs);
  const missing = [];
  const present = [];
  for (const [role, keys] of Object.entries(ROLE_FIELD_KEYS)) {
    for (const key of keys) {
      const hit = bridged.roles[role] && bridged.roles[role][key] !== undefined;
      (hit ? present : missing).push({ role, key, remediation: hit ? null : `post ${role.toUpperCase()} artifact with ${key}:` });
    }
  }
  const snapPath = path.join(os.homedir(), '.megingjord', `governance-fields-${issue}.json`);
  const stale = fs.existsSync(snapPath) ? !isFresh(JSON.parse(fs.readFileSync(snapPath, 'utf8')), nowMs) : true;
  return { issue, missing, present, stale, ok: !missing.length && !stale };
}

module.exports = { diagnoseEvidence };
