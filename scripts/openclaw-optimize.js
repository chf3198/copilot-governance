#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const profile = process.argv[2] || 'coding';
const force = process.argv.includes('--force');
const stateFile = path.join(os.homedir(), '.copilot', 'openclaw-model-refresh.json');
const maxAgeMs = 90 * 60 * 1000;

function run(cmd) { return execSync(cmd, { stdio: 'inherit' }); }
function shouldRefresh() {
  if (force || !fs.existsSync(stateFile)) return true;
  try {
    const last = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return Date.now() - Date.parse(last.ts) > maxAgeMs || last.profile !== profile;
  } catch { return true; }
}

run('node scripts/openclaw-preflight.js');
if (shouldRefresh()) {
  run(`refresh-openclaw-models ${profile} 8`);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({ ts: new Date().toISOString(), profile }, null, 2));
} else {
  console.log('Skipping model refresh: recently refreshed. Use --force to override.');
}
run(`node scripts/openclaw-lane-log.js record openclaw ${profile}`);
run('node scripts/openclaw-lane-log.js report 7');
console.log('OpenClaw optimize complete.');
