// baton-signing.js — HAMR Wave 1 Ed25519 sign/verify for baton handoff artifacts (#894)
// node:crypto only. Wave 1: T4 ephemeral keying; T1/T2/T3 probed (presence-only) for hamr:doctor #896.
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before any credential read (canonical shim)
'use strict';
const { createHash, generateKeyPairSync, sign: cSign, verify: cVerify } = require('node:crypto');
const { execSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

// Simplified JCS subset; full RFC-8785 canonicalization deferred to Wave 4.
const PROBE_TIMEOUT_MS = 2000;

/** NFC + strip trailing whitespace + trim.
 * @param {string} s - Raw artifact string.
 * @returns {string} Canonicalized string safe to sign.
 */
function canonicalize(s) {
  return s.normalize('NFC').replace(/\s+$/gm, '').replace(/\s+\n/g, '\n').trim();
}

let _sessionKey = null;
const { createPrivateKey } = require('node:crypto');

/** Return (creating once) the Ed25519 keypair. Reads OPERATOR_KEY_SEED_B64 (T3-like
 * persisted key) if set, else generates T4 ephemeral.
 * @returns {{ privateKey: object, pubKeyDer: Buffer, key_id: string, tier: string }} Session key.
 */
function getSessionKey() {
  if (_sessionKey) return _sessionKey;
  let privateKey, tier;
  const seed = process.env.OPERATOR_KEY_SEED_B64;
  if (seed) {
    // PKCS8 base64 (32-byte raw Ed25519 seed wrapped). Use raw seed via PKCS8 prefix.
    const rawSeed = Buffer.from(seed, 'base64');
    if (rawSeed.length !== 32) throw new Error('OPERATOR_KEY_SEED_B64 must decode to 32 bytes');
    const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), rawSeed]);
    privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
    tier = 'T3-env';
  } else {
    privateKey = generateKeyPairSync('ed25519').privateKey;
    tier = 'T4';
  }
  const publicKey = require('node:crypto').createPublicKey(privateKey);
  const pubKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const hex = createHash('sha256').update(pubKeyDer).digest('hex');
  _sessionKey = { privateKey, pubKeyDer, key_id: `op-${hex.slice(0, 16)}`, tier };
  return _sessionKey;
}

/** Probe best available key-store tier (T1→T2→T3→T4). Presence-only in Wave 1.
 * T1 hardware enclave → T2 OS keychain (keytar) → T3 Age file → T4 ephemeral.
 * @returns {Promise<{tier: string, source: string, fallback_reason?: string}>} Probe result.
 */
async function probeKeyTier() {
  const platform = process.platform;
  const sh = (cmd) => execSync(cmd, { stdio: 'pipe', timeout: PROBE_TIMEOUT_MS });
  try {
    if (platform === 'linux') sh('which tpm2-tools');
    else if (platform === 'darwin') sh('which security');
    else sh('where certutil');
    return { tier: 'T1', source: 'hardware-enclave-tool-present' };
  } catch { /* fall through */ }
  try { await import('keytar'); return { tier: 'T2', source: 'keytar-loaded' }; }
  catch { /* fall through */ }
  try {
    const ageFile = join(homedir(), '.megingjord', 'keys', 'operator-ed25519.age');
    if (existsSync(ageFile)) { sh('which age'); return { tier: 'T3', source: 'age-file-present' }; }
  } catch { /* fall through */ }
  return { tier: 'T4', source: 'ephemeral-in-memory', fallback_reason: 'no-T1-T2-T3-available' };
}

/** Sign an artifact using the session T4 key. Wave 1 always uses T4.
 * Returns publicKey (SPKI base64, no padding) so callers can populate publishedKeys.
 * Private key is never included in the return value.
 * @param {string} artifact - Baton handoff text to sign.
 * @param {object} [options] - Reserved for future wave options (keyTier, keyId).
 * @returns {Promise<{artifact: string, signature: string, key_id: string, timestamp: string, tier: string, publicKey: string}>} Signed result.
 */
async function sign(artifact, options = {}) {
  void options;
  const { privateKey, pubKeyDer, key_id, tier } = getSessionKey();
  const sig = cSign(null, Buffer.from(canonicalize(artifact), 'utf8'), privateKey);
  return {
    artifact,
    signature: sig.toString('base64').replace(/=+$/, ''),
    key_id,
    timestamp: new Date().toISOString(),
    tier: tier ?? 'T4',
    publicKey: pubKeyDer.toString('base64').replace(/=+$/, ''),
  };
}

/** Verify a signed artifact against a map of published SPKI public keys (base64, no padding OK).
 * @param {{artifact: string, signature: string, key_id: string}} signedArtifact - Output from sign().
 * @param {Map<string, string>} publishedKeys - key_id to base64 SPKI public key.
 * @returns {Promise<{ok: boolean, reason?: string}>} Verification result.
 */
async function verify(signedArtifact, publishedKeys) {
  const { artifact, signature, key_id } = signedArtifact;
  if (!publishedKeys.has(key_id)) return { ok: false, reason: 'unknown_key_id' };
  try {
    const der = Buffer.from(publishedKeys.get(key_id), 'base64');
    const canonical = Buffer.from(canonicalize(artifact), 'utf8');
    const { createPublicKey } = require('node:crypto');
    const pub = createPublicKey({ key: der, format: 'der', type: 'spki' });
    const ok = cVerify(null, canonical, pub, Buffer.from(signature, 'base64'));
    return ok ? { ok: true } : { ok: false, reason: 'bad_signature' };
  } catch { return { ok: false, reason: 'bad_signature' }; }
}

/** Append a signature trailer suitable for a GitHub comment.
 * Format: artifact + blank line + "signature:" / "key_id:" / "timestamp:" lines.
 * @param {string} artifact - Baton artifact text.
 * @param {object} [options] - Forwarded to sign().
 * @returns {Promise<string>} Artifact with trailing signature block.
 */
async function emitTrailer(artifact, options = {}) {
  const signed = await sign(artifact, options);
  return `${artifact}\n\nsignature: ${signed.signature}\nkey_id: ${signed.key_id}\ntimestamp: ${signed.timestamp}`;
}

module.exports = { sign, verify, emitTrailer, probeKeyTier };
