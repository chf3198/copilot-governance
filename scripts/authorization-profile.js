#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const REQUIRED_CAPS = ['install', 'upgrade', 'privileged', 'execute_local', 'execute_remote'];
const ORDER = ['cli', 'env', 'config', 'default'];
const DEFAULT_SCHEMA_PATH = path.join(__dirname, '..', '..', 'config', 'authorization-profiles.json');

function parseCli(argv = []) {
  const k = argv.find(a => a.startsWith('--profile='));
  if (k) return k.split('=')[1];
  const i = argv.indexOf('--profile');
  return i >= 0 ? argv[i + 1] : undefined;
}

function isCaps(x) {
  return x && typeof x === 'object' && REQUIRED_CAPS.every(k => typeof x[k] === 'boolean');
}

function validateSchema(schema) {
  const allowed = ['owner', 'guarded', 'restricted'];
  if (!schema || typeof schema !== 'object') throw new Error('schema must be an object');
  if (!schema.profiles || typeof schema.profiles !== 'object') throw new Error('schema.profiles missing');
  for (const name of allowed) {
    if (!isCaps(schema.profiles[name])) throw new Error(`profile ${name} missing required capabilities`);
  }
  if (!allowed.includes(schema.defaultProfile)) throw new Error('defaultProfile must be owner|guarded|restricted');
  return schema;
}

function readSchema(filePath = DEFAULT_SCHEMA_PATH) {
  return validateSchema(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

function parseActiveProfile(opts = {}) {
  const argv = opts.argv || process.argv.slice(2);
  const env = opts.env || process.env;
  const schema = validateSchema(opts.schema || readSchema(opts.schemaPath));
  const chosen = [
    { source: 'cli', value: parseCli(argv) },
    { source: 'env', value: env.MEGINGJORD_AUTH_PROFILE },
    { source: 'config', value: schema.defaultProfile },
    { source: 'default', value: 'owner' },
  ].find(x => x.value);
  const profile = String(chosen.value).toLowerCase();
  if (!schema.profiles[profile]) throw new Error(`unknown authorization profile: ${profile}`);
  return { profile, capabilities: schema.profiles[profile], source: chosen.source, precedence: ORDER };
}

function main() {
  try {
    const out = parseActiveProfile();
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } catch (e) {
    process.stderr.write(`authorization-profile: ${e.message}\n`);
    process.exit(2);
  }
}

module.exports = { REQUIRED_CAPS, ORDER, DEFAULT_SCHEMA_PATH, parseCli, validateSchema, readSchema, parseActiveProfile };
if (require.main === module) main();
