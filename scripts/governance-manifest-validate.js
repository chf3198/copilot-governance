#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const schemaPath = path.join(root, 'inventory', 'governance-manifest.schema.json');
const defaultManifestPath = path.join(root, 'inventory', 'governance-manifest.sample.json');
const allowedTargets = new Set(['copilot', 'cline', 'claude-code', 'continue', 'antigravity']);
const allowedPriority = new Set(['P0', 'P1', 'P2', 'P3']);

function fail(msg) { process.stderr.write(`manifest-validate: ${msg}\n`); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function uniq(arr) { return new Set(arr).size === arr.length; }

function validateUnit(u, i, errors) {
  const req = ['id', 'title', 'priority', 'appliesTo', 'targets', 'tags', 'bodyRef'];
  for (const k of req) if (u[k] === undefined) errors.push(`units[${i}] missing ${k}`);
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(String(u.id || ''))) errors.push(`units[${i}].id invalid`);
  if (!allowedPriority.has(u.priority)) errors.push(`units[${i}].priority invalid`);
  if (!Array.isArray(u.appliesTo) || u.appliesTo.length < 1) errors.push(`units[${i}].appliesTo invalid`);
  if (!Array.isArray(u.targets) || u.targets.length < 1) errors.push(`units[${i}].targets invalid`);
  if (Array.isArray(u.targets) && !uniq(u.targets)) errors.push(`units[${i}].targets has duplicates`);
  if (Array.isArray(u.targets)) {
    for (const t of u.targets) if (!allowedTargets.has(t)) errors.push(`units[${i}].targets contains ${t}`);
  }
  if (!Array.isArray(u.tags)) errors.push(`units[${i}].tags invalid`);
  const rx = /^(instructions|skills|hooks|scripts|docs)\/.+\.(md|instructions\.md)$/;
  if (!rx.test(String(u.bodyRef || ''))) errors.push(`units[${i}].bodyRef invalid`);
  const abs = path.join(root, String(u.bodyRef || ''));
  if (!fs.existsSync(abs)) errors.push(`units[${i}].bodyRef not found: ${u.bodyRef}`);
}

function validate(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') errors.push('manifest must be object');
  if (manifest.version !== 1) errors.push('version must be 1');
  if (!Array.isArray(manifest.units) || manifest.units.length < 1) errors.push('units must be non-empty array');
  if (Array.isArray(manifest.units)) manifest.units.forEach((u, i) => validateUnit(u, i, errors));
  const ids = Array.isArray(manifest.units) ? manifest.units.map(u => u.id).filter(Boolean) : [];
  if (!uniq(ids)) errors.push('unit ids must be unique');
  return errors;
}

function main() {
  const file = process.argv[2] ? path.resolve(process.argv[2]) : defaultManifestPath;
  try {
    readJson(schemaPath);
    const manifest = readJson(file);
    const errors = validate(manifest);
    if (errors.length) {
      errors.forEach(e => fail(e));
      process.exit(1);
    }
    process.stdout.write(`manifest-validate: OK (${path.relative(root, file)})\n`);
  } catch (e) {
    fail(e.message);
    process.exit(2);
  }
}

module.exports = { validate };
if (require.main === module) main();
