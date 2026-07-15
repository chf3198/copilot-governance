#!/usr/bin/env node
'use strict';
// #3173 — atomic credential write: keychain preferred, gitignored .env fallback (#2291 D6).
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { keychainProvider } = require('./keychain-source');
require('./load-local-env').loadLocalEnvOnce();

const ENV_NAME = /^[A-Z][A-Z0-9_]{0,127}$/;

function repoEnvPath(root = process.cwd()) {
  return path.join(root, '.env');
}

function writeEnvAtomic(envPath, name, value) {
  const prior = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = prior.split('\n').filter((line) => line && !line.startsWith(`${name}=`));
  lines.push(`${name}=${value}`);
  const next = `${lines.join('\n')}\n`;
  const tmp = `${envPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, next, { mode: 0o600 });
  fs.renameSync(tmp, envPath);
  return { path: envPath, method: 'env' };
}

function writeKeychain(name, value, service = process.env.MEGINGJORD_KEYCHAIN_SERVICE || 'megingjord-harness') {
  const provider = keychainProvider(process.env);
  if (provider === 'macos') {
    execFileSync('security', ['add-generic-password', '-a', name, '-s', service, '-w', value, '-U'], { stdio: 'pipe' });
    return { method: 'keychain-macos', service };
  }
  if (provider === 'op') {
    execFileSync('op', ['item', 'create', '--category', 'login', '--vault', service, `--title=${name}`, `password=${value}`], { stdio: 'pipe' });
    return { method: 'keychain-op', service };
  }
  return null;
}

function setCredential(name, value, opts = {}) {
  if (!ENV_NAME.test(name)) throw new Error(`invalid env name: ${name}`);
  if (!value || !String(value).trim()) throw new Error('empty credential value rejected');
  const keychain = writeKeychain(name, String(value).trim());
  if (keychain) return { ok: true, name, ...keychain };
  const envPath = opts.envPath || repoEnvPath(opts.root);
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const envWrite = writeEnvAtomic(envPath, name, String(value).trim());
  return { ok: true, name, ...envWrite };
}

module.exports = { setCredential, writeEnvAtomic, repoEnvPath, ENV_NAME };
