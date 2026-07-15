#!/usr/bin/env node
'use strict';
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before any credential read (canonical shim)
const fs = require('fs');
const path = require('path');
const sig = require('./governance-artifact-signature');
const { detectRuntime } = require('./detect-runtime');

const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i += 2) if (args[i]?.startsWith('--')) opt[args[i].slice(2)] = args[i + 1] || '';

const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'inventory', 'team-model-signatures.json'), 'utf8'));
// Registry integrity bound into signing (#3029 C1 AC3): refuse to sign on
// signer-surface drift so a stale/edited registry cannot mint mismatched
// aliases. MEGINGJORD_SKIP_REGISTRY_INTEGRITY=1 is the documented escape hatch (G6).
const { verifyRegistryIntegrity } = require('./registry-version');
const integrity = verifyRegistryIntegrity(registry);
if (!integrity.ok && process.env.MEGINGJORD_SKIP_REGISTRY_INTEGRITY !== '1') {
  process.stderr.write(`agent-signature: registry integrity ${integrity.reason} `
    + `(stored=${integrity.stored || 'none'} expected=${integrity.expected}). ${integrity.hint || ''}\n`);
  process.exit(3);
}
// Identity is settings/substrate-derived, never hard-coded to one team (G5).
// Resolve from explicit flag, then HAMR_TEAM/MEGINGJORD_TEAM env, then a HIGH-CONFIDENCE
// runtime detection (#2659) — so each runtime auto-attributes its team even when HAMR_TEAM
// is unset; 'unknown' detection still falls through to the fail-loud below (no guessing).
let team = (opt.team || process.env.HAMR_TEAM || process.env.MEGINGJORD_TEAM || '').toLowerCase();
if (!team) {
  const detected = detectRuntime();
  if (detected.confidence === 'high') team = detected.runtime;
}
const model = (opt.model || process.env.HAMR_MODEL || process.env.MEGINGJORD_MODEL || '').toLowerCase();
const role = (opt.role || 'collaborator').toLowerCase();
const substrate = (opt.substrate || 'local').toLowerCase();
const deviceName = (opt.device || '').toLowerCase();
const format = opt.format || 'json';
const withCrypto = String(opt['include-crypto'] || '').toLowerCase() === 'true';
const keyFile = opt['private-key-file'] ? path.resolve(opt['private-key-file']) : '';
const device = deviceName ? `/${deviceName}` : '';

if (!team || !model) {
  process.stderr.write(
    'agent-signature: unresolved identity. Pass --team and --model, or set '
    + 'HAMR_TEAM and HAMR_MODEL. Refusing to emit a default signature so the '
    + 'signer team/model is never silently mis-attributed (provenance integrity).\n'
  );
  process.exit(2);
}

function match(entry) {
  return (entry.team === '*' || entry.team === team)
    && new RegExp(entry.modelPattern, 'i').test(model)
    && (!entry.devicePattern || new RegExp(entry.devicePattern, 'i').test(deviceName));
}

function baseLines(payload) {
  return `Signed-by: ${payload.signedBy}\nTeam&Model: ${payload.teamModel}\nRole: ${payload.role}`;
}

const payload = {
  signedBy: `${registry.registry.find(match)?.aliasSeed || registry.defaultAliasSeed} ${registry.roleSurnames[role] || registry.roleSurnames.collaborator}`,
  teamModel: `${team}:${model}@${substrate}${device}`,
  role,
};

let text = baseLines(payload);
if (withCrypto) {
  const keyMeta = (registry.cryptoKeys || []).find(k => k.team === team && k.role === role);
  const privateKey = keyFile ? fs.readFileSync(keyFile, 'utf8') : process.env.GOVERNANCE_SIGNING_PRIVATE_KEY_PEM || '';
  if (!keyMeta || !privateKey) {
    process.stderr.write('Missing crypto key metadata or private key (use --private-key-file or GOVERNANCE_SIGNING_PRIVATE_KEY_PEM).\n');
    process.exit(1);
  }
  text = sig.appendSignature(text, sig.signPayload(text, privateKey, keyMeta.keyId));
}

if (format === 'text') console.log(text);
else console.log(JSON.stringify({ ...payload, cryptoIncluded: withCrypto }, null, 2));
