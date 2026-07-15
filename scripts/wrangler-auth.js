#!/usr/bin/env node
// tier: 2
// wrangler-auth.js — Isolated wrangler executor for D1 (#1564).
// Sources CLOUDFLARE_API_TOKEN from .env into a child process only.
// Token never appears in shell history or command-line arguments.
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before any credential read (canonical shim)
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENV_FILE = path.join(REPO_ROOT, '.env');

function loadToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  if (!fs.existsSync(ENV_FILE)) return null;
  const raw = fs.readFileSync(ENV_FILE, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^CLOUDFLARE_API_TOKEN\s*=\s*(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function loadAccountId() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!fs.existsSync(ENV_FILE)) return null;
  const raw = fs.readFileSync(ENV_FILE, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^CLOUDFLARE_ACCOUNT_ID\s*=\s*(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function run(args) {
  const token = loadToken();
  if (!token) {
    process.stderr.write('[wrangler-auth] CLOUDFLARE_API_TOKEN not found in env or .env\n');
    process.exit(1);
  }
  const env = {
    ...process.env,
    CLOUDFLARE_API_TOKEN: token,
    CLOUDFLARE_ACCOUNT_ID: loadAccountId() || process.env.CLOUDFLARE_ACCOUNT_ID || '',
  };
  // Redact token from any inherited DEBUG output
  delete env.DEBUG;
  const result = spawnSync('npx', ['wrangler', ...args], {
    env, stdio: 'inherit', shell: false,
  });
  process.exit(result.status ?? 1);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args.length) {
    process.stderr.write('Usage: node wrangler-auth.js <wrangler args...>\n');
    process.exit(1);
  }
  run(args);
}

module.exports = { run, loadToken };
