#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(root, 'inventory', 'governance-manifest.sample.json');
const allTargets = ['copilot', 'cline', 'claude-code', 'continue'];

function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

function buildMatrix(manifest) {
  const matrix = {};
  for (const target of allTargets) {
    matrix[target] = manifest.units
      .filter(u => u.targets.includes(target))
      .map(u => ({ id: u.id, priority: u.priority, appliesTo: u.appliesTo }));
  }
  return matrix;
}

function printTable(matrix, manifest) {
  console.log('\nGovernance Compatibility Matrix\n');
  console.log(`${'Target'.padEnd(16)}| ${'Units (id:priority)'.padEnd(60)}`);
  console.log('-'.repeat(78));
  for (const [target, units] of Object.entries(matrix)) {
    const cell = units.length
      ? units.map(u => `${u.id}:${u.priority}`).join(', ')
      : '(none)';
    console.log(`${target.padEnd(16)}| ${cell}`);
  }
  console.log('');
  const active = allTargets.filter(t => matrix[t].length > 0).length;
  console.log(`Summary: ${manifest.units.length} units × ${active} active targets`);
}

function printJson(matrix) {
  console.log(JSON.stringify({
    generated: new Date().toISOString(),
    manifest: manifestPath,
    matrix,
  }, null, 2));
}

const manifest = readJson(manifestPath);
const matrix = buildMatrix(manifest);
const isJson = process.argv.includes('--json');
if (isJson) printJson(matrix); else printTable(matrix, manifest);

const active = allTargets.filter(t => matrix[t].length > 0).length;
process.stderr.write(
  `compatibility-matrix: ${manifest.units.length} units, ${active} active targets\n`
);
