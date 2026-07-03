'use strict';
const fs = require('fs');
const path = require('path');
const { createPrivateKey, createPublicKey, sign, verify } = require('crypto');

const REGISTRY = path.join(__dirname, '..', '..', 'inventory', 'team-model-signatures.json');
const STRIP = /^Crypto-(Algorithm|Key-Id|Signature):/i;

function parseField(body, re) { return ((body || '').match(re) || [])[1] || null; }
function teamOf(teamModel) { return ((teamModel || '').match(/^([^:]+):/) || [])[1] || null; }
function normalizePem(p) { return (p || '').replace(/\\n/g, '\n'); }
function b64pad(v) { return v + '='.repeat((4 - (v.length % 4)) % 4); }
function payload(body) { return (body || '').split(/\r?\n/).filter(l => !STRIP.test(l)).join('\n').trimEnd(); }

function readRegistry() {
  const json = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  return json.cryptoKeys || [];
}

function keyFor(team, role, keyId, keys) {
  const source = keys || readRegistry();
  return source.find(k => k.team === team && k.role === role && k.keyId === keyId) || null;
}

function signPayload(artifact, privateKeyPem, keyId) {
  const msg = Buffer.from(payload(artifact));
  const priv = createPrivateKey(normalizePem(privateKeyPem));
  const signature = sign(null, msg, priv).toString('base64').replace(/=+$/g, '');
  return { algorithm: 'ed25519', keyId, signature };
}

function appendSignature(artifact, sig) {
  return `${payload(artifact)}\nCrypto-Algorithm: ${sig.algorithm}\nCrypto-Key-Id: ${sig.keyId}\nCrypto-Signature: ${sig.signature}`;
}

function verifyArtifact(body, expectedRole, keys) {
  const teamModel = parseField(body, /Team&Model:\s*(\S+)/i);
  const role = (parseField(body, /Role:\s*([^\n]+)/i) || '').trim().toLowerCase();
  const keyId = parseField(body, /Crypto-Key-Id:\s*(\S+)/i);
  const algo = (parseField(body, /Crypto-Algorithm:\s*(\S+)/i) || '').toLowerCase();
  const sigB64 = parseField(body, /Crypto-Signature:\s*([A-Za-z0-9_+/=-]+)/i);
  const team = teamOf(teamModel);
  const violations = [];
  if (!team) violations.push('Missing Team&Model for crypto verification');
  if (expectedRole && role !== expectedRole) violations.push(`Role mismatch: expected ${expectedRole}, got ${role || 'missing'}`);
  if (algo !== 'ed25519') violations.push(`Unsupported Crypto-Algorithm: ${algo || 'missing'}`);
  if (!keyId) violations.push('Missing Crypto-Key-Id');
  if (!sigB64) violations.push('Missing Crypto-Signature');
  const key = team && role && keyId ? keyFor(team, role, keyId, keys) : null;
  if (!key && keyId) violations.push(`Unknown crypto key mapping: ${team || 'unknown'}/${role || 'unknown'} ${keyId}`);
  if (violations.length) return { ok: false, violations };
  try {
    const pub = createPublicKey(normalizePem(key.publicKey));
    const ok = verify(null, Buffer.from(payload(body)), pub, Buffer.from(b64pad(sigB64), 'base64'));
    return ok ? { ok: true, violations: [] } : { ok: false, violations: ['Invalid Crypto-Signature for payload'] };
  } catch {
    return { ok: false, violations: ['Cryptographic verification failed'] };
  }
}

module.exports = { appendSignature, payload, signPayload, teamOf, verifyArtifact };
