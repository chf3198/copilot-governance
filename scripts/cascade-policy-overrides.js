#!/usr/bin/env node
// tier: 2
// cascade-policy-overrides.js — Wave 8 child 1 (#976).
// Reads HAMR /quota for hit_rate_7d + provider state; writes
// ~/.megingjord/cascade-policy-overrides.json for model-routing-engine consumption.
// Implements convergence-design item 4 (producer side).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_HAMR_URL = process.env.HAMR_URL || 'https://hamr.chf3198.workers.dev';
const OVERRIDES_FILE = path.join(os.homedir(), '.megingjord', 'cascade-policy-overrides.json');
const FETCH_TIMEOUT_MS = 5000;

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

async function fetchQuota(url) {
  try {
    const res = await fetch(`${url}/quota`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return { ok: false, reason: `quota_http_${res.status}` };
    return { ok: true, body: await res.json() };
  } catch (err) { return { ok: false, reason: err?.message || 'quota_fetch_failed' }; }
}

/** Build the overrides record from a /quota response.
 * @param {object} quotaBody - Parsed /quota response.
 * @returns {object} Overrides record.
 */
function buildOverrides(quotaBody) {
  return {
    ts: Date.now(),
    hit_rate_7d: quotaBody?.hit_rate_7d ?? null,
    stale: quotaBody?.stale ?? false,
    providers: quotaBody?.providers ?? {},
    source: 'hamr/quota',
    schema_version: 1,
  };
}

/** Write overrides file. Returns the record + the destination path.
 * @param {object} record - Output of buildOverrides.
 * @param {object} [opts] - { file }.
 * @returns {{ok: boolean, file: string, record: object}} Outcome.
 */
function writeOverrides(record, opts = {}) {
  const file = opts.file ?? OVERRIDES_FILE;
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  return { ok: true, file, record };
}

async function run(opts = {}) {
  const url = opts.url || DEFAULT_HAMR_URL;
  const quota = await fetchQuota(url);
  if (!quota.ok) {
    return { ok: false, reason: quota.reason, hint: 'graceful_skip — model-routing-engine falls back to default routing' };
  }
  return writeOverrides(buildOverrides(quota.body), opts);
}

if (require.main === module) {
  run().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 0);
  }).catch((err) => { console.error(err.message); process.exit(0); });
}

module.exports = { run, buildOverrides, writeOverrides, fetchQuota, OVERRIDES_FILE };
