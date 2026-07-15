#!/usr/bin/env node
'use strict';
// crypto-signing-bootstrap (#1725) — generates ed25519 keypairs for
// (team, role) per the #1721 promotion plan. Run once per team:
//   node scripts/global/crypto-signing-bootstrap.js --team codex
// Private keys persist at ~/.megingjord/keys/<team>-<role>.key (mode 0600).
// Public keys printed for manual addition to inventory/team-model-signatures.json.

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROLES = ['manager', 'collaborator', 'admin', 'consultant'];

function parseArgs(argv) {
  const team = (argv.find(a => a.startsWith('--team=')) || '').slice('--team='.length)
    || argv[argv.indexOf('--team') + 1];
  return { team };
}

function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

function keyDir() {
  return path.join(os.homedir(), '.megingjord', 'keys');
}

function ensureKeyDir() {
  const dir = keyDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function persistPrivate(team, role, privatePem) {
  const dir = ensureKeyDir();
  const file = path.join(dir, `${team}-${role}.key`);
  fs.writeFileSync(file, privatePem, { mode: 0o600 });
  return file;
}

function bootstrapTeam(team) {
  if (!team) throw new Error('--team required');
  const summary = [];
  for (const role of ROLES) {
    const { publicPem, privatePem } = generateKeypair();
    const keyFile = persistPrivate(team, role, privatePem);
    summary.push({
      team, role,
      keyId: `${team}-${role}-v1`,
      publicKey: publicPem.replace(/\n/g, '\\n').trim(),
      privateKeyPath: keyFile,
    });
  }
  return summary;
}

if (require.main === module) {
  const { team } = parseArgs(process.argv.slice(2));
  try {
    const result = bootstrapTeam(team);
    console.log('# Add this entry block to inventory/team-model-signatures.json `cryptoKeys` array:');
    console.log(JSON.stringify(result.map(({ team, role, keyId, publicKey }) =>
      ({ team, role, keyId, publicKey })), null, 2));
    console.log(`# Private keys stored at ${keyDir()}`);
  } catch (e) {
    console.error('bootstrap failed:', e.message);
    process.exit(1);
  }
}

module.exports = { bootstrapTeam, generateKeypair, parseArgs, ROLES };
