#!/usr/bin/env node
// tier: 2
// governance-bundle-push.js — operationalizes Epic #2094. Reads a precomputed
// per-issue governance-fields snapshot, builds the redacted + content-hashed
// bundle (governance-bundle.js), signs it with the operator Ed25519 key, and
// POSTs to HAMR for KV storage at `governance-bundle:<issue>` — so the
// read-only tool:governance-bundle dispatch (#2094) serves real data and a
// fleet model can self-attest a compliant Consultant CLOSEOUT (free-fleet, G3).
// Mirrors the substrate-health-push.js producer pattern; graceful no-op (G6)
// when the fields snapshot or operator key is unavailable.
'use strict';
require('./load-local-env').loadLocalEnvOnce();
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildBundle } = require('./governance-bundle');
const { loadEd25519Key } = require('./substrate-health-push');

const DEFAULT_HAMR_URL = process.env.HAMR_URL || 'https://hamr.chf3198.workers.dev';
const KEY_ID = process.env.OPERATOR_KEY_ID || 'operator-default';

// Snapshot written by the orchestrator's consultant-checks + rubric-score run
// for a given issue (the gathered FIELD_KEYS values). Mirrors substrate-health's
// precomputed HEALTH_FILE rather than shelling out inline (keeps push pure).
function fieldsFile(issue) {
  return path.join(os.homedir(), '.megingjord', `governance-fields-${issue}.json`);
}

function readFields(issue) {
  const f = fieldsFile(issue);
  if (!fs.existsSync(f)) return null;
  try { const parsed = JSON.parse(fs.readFileSync(f, 'utf8')); return parsed.fields || parsed; } catch { return null; }
}

async function pushBundle(opts = {}) {
  const url = opts.url || DEFAULT_HAMR_URL;
  const issue = opts.issue;
  if (!issue) return { ok: false, reason: 'no_issue' };
  const fields = opts.fields || readFields(issue);
  if (!fields) return { ok: false, reason: 'no_fields_snapshot' };
  const bundle = buildBundle({ issue, fields, nowMs: opts.nowMs || Date.now() });
  // Deterministic serialization (buildBundle emits keys in a fixed order; the
  // bundle's own content_hash anchors field integrity). NOT a replacer-array —
  // that would strip nested `fields` values from the signed/pushed payload.
  const canonical = JSON.stringify(bundle);
  let sig;
  try { sig = crypto.sign(null, Buffer.from(canonical), opts.key || loadEd25519Key()).toString('base64'); }
  catch { return { ok: false, reason: 'no_operator_key' }; }
  const doFetch = opts.fetchImpl || fetch;
  const resp = await doFetch(`${url}/governance-bundle`, {
    method: 'POST',
    headers: {
      authorization: 'DPoP governance-bundle-push', 'content-type': 'application/json',
      'x-hamr-key-id': KEY_ID, 'x-hamr-signature': sig, 'x-hamr-canonical': canonical,
    },
    body: canonical,
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, issue: Number(issue), content_hash: bundle.content_hash, response: data };
}

if (require.main === module) {
  const i = process.argv.indexOf('--issue');
  const issue = i >= 0 ? process.argv[i + 1] : null;
  pushBundle({ issue }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }).catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { pushBundle, readFields, fieldsFile };
