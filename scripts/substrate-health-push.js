#!/usr/bin/env node
// tier: 2
// substrate-health-push.js — HAMR Wave 6 child 3 (#943).
// Runs substrate-health.js (#911) locally; signs canonical JSON; POSTs to HAMR /substrate-health.
'use strict';
require('./load-local-env').loadLocalEnvOnce();
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HEALTH_FILE = path.join(os.homedir(), '.megingjord', 'substrate-health.json');
const DEFAULT_HAMR_URL = process.env.HAMR_URL || 'https://hamr.chf3198.workers.dev';
const KEY_ID = process.env.OPERATOR_KEY_ID || 'operator-default';
const KEY_FILE = path.join(os.homedir(), '.megingjord', 'keys', 'operator-ed25519.pem');

function loadEd25519Key() {
  const seedB64 = process.env.OPERATOR_KEY_SEED_B64;
  if (seedB64) {
    const seed = Buffer.from(seedB64, 'base64');
    if (seed.length !== 32) throw new Error('OPERATOR_KEY_SEED_B64 must decode to 32 bytes');
    const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
    return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  }
  if (fs.existsSync(KEY_FILE)) return crypto.createPrivateKey(fs.readFileSync(KEY_FILE));
  throw new Error('no operator Ed25519 key available');
}

function canonicalize(payload) {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

function readHealthSnapshot() {
  if (!fs.existsSync(HEALTH_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8')); } catch { return null; }
}

async function pushHealth(opts = {}) {
  const url = opts.url || DEFAULT_HAMR_URL;
  const snapshot = opts.snapshot || readHealthSnapshot();
  if (!snapshot || !snapshot.providers) return { ok: false, reason: 'no_substrate_health_snapshot' };
  const payload = { ts: Date.now(), providers: snapshot.providers, tier: snapshot.tier ?? null };
  const canonical = canonicalize(payload);
  const key = loadEd25519Key();
  const sig = crypto.sign(null, Buffer.from(canonical), key).toString('base64');
  const resp = await fetch(`${url}/substrate-health`, {
    method: 'POST',
    headers: {
      'authorization': 'DPoP substrate-health-push', 'content-type': 'application/json',
      'x-hamr-key-id': KEY_ID, 'x-hamr-signature': sig, 'x-hamr-canonical': canonical,
    },
    body: canonical,
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, payload, response: data };
}

if (require.main === module) {
  pushHealth().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }).catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { pushHealth, canonicalize, loadEd25519Key };
