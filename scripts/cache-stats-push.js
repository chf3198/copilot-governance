#!/usr/bin/env node
// tier: 2
// cache-stats-push.js — HAMR Wave 5 child 2 (#933).
// Computes rolling 7d hit-rate locally and POSTs Ed25519-signed payload to HAMR /cache-stats.
'use strict';
require('./load-local-env').loadLocalEnvOnce();
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { runGate } = require('./cache-hit-gate');

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
  throw new Error('no operator Ed25519 key available (set OPERATOR_KEY_SEED_B64 or place key at ~/.megingjord/keys/operator-ed25519.pem)');
}

function canonicalize(payload) {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

async function pushHitRate(opts = {}) {
  const url = opts.url || DEFAULT_HAMR_URL;
  const gate = runGate({ floor: 0 });
  if (gate.hit_rate === null) return { ok: false, reason: 'no_samples_in_window' };
  const payload = { hit_rate: gate.hit_rate, sample_count: gate.sample_count, ts: Date.now() };
  const canonical = canonicalize(payload);
  const key = loadEd25519Key();
  const sig = crypto.sign(null, Buffer.from(canonical), key).toString('base64');
  const resp = await fetch(`${url}/cache-stats`, {
    method: 'POST',
    headers: {
      'authorization': 'DPoP cache-stats-push', 'content-type': 'application/json',
      'x-hamr-key-id': KEY_ID, 'x-hamr-signature': sig, 'x-hamr-canonical': canonical,
    },
    body: canonical,
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, payload, response: data };
}

if (require.main === module) {
  pushHitRate().then((result) => {
    console.log(JSON.stringify(result, null, 2));
      if (!result.ok && result.status === 401) emitAuthError(result);
    process.exit(result.ok ? 0 : 1);
  }).catch((err) => { console.error(err.message); process.exit(1); });
}

  function emitAuthError(result) {
    const reason = result.response?.reason ?? 'unknown';
    const hint = reason === 'unknown_key_id'
      ? 'Register SPKI in PUBLISHER_KEYRING: see docs/howto/hamr-push-auth.md'
      : reason === 'no_publisher_keyring_configured'
        ? 'Set PUBLISHER_KEYRING wrangler secret: see docs/howto/hamr-push-auth.md'
        : `Check KEY_ID + key material. Reason: ${reason}`;
    process.stderr.write(`[cache-stats-push] 401 auth failure — ${hint}\n`);
  }

module.exports = { pushHitRate, canonicalize, loadEd25519Key };
