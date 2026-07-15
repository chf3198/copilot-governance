#!/usr/bin/env node
'use strict';
// goal-tier-override (#1261 / Epic #1113 AC7) — operator force-escalate / force-de-escalate CLI.
// Per Phase-0 R&D §5 + §6.AC7. Audit trail at ~/.megingjord/operator-overrides.json.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ALLOWED_ACTUATORS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];
const ALLOWED_TIERS = ['strict', 'relaxed', 'B', 'B+', 'B++', 'B+++', 'B++++'];
const DEFAULT_STORE = path.join(os.homedir(), '.megingjord', 'operator-overrides.json');

function getArg(argv, name) { const i = argv.indexOf(`--${name}`); return i > -1 ? argv[i + 1] : null; }

function parseArgs(argv) {
  const reset = argv.includes('--reset');
  const actuator = getArg(argv, 'actuator');
  const tier = getArg(argv, 'tier');
  const reason = getArg(argv, 'reason');
  const until = getArg(argv, 'until');
  if (!actuator || !ALLOWED_ACTUATORS.includes(actuator)) {
    throw new Error(`--actuator must be one of: ${ALLOWED_ACTUATORS.join(', ')}`);
  }
  if (!reason) throw new Error('--reason required for audit trail');
  if (!reset && !ALLOWED_TIERS.includes(tier)) {
    throw new Error(`--tier must be one of: ${ALLOWED_TIERS.join(', ')} (or use --reset)`);
  }
  return { actuator, tier, reason, until, reset };
}

function loadStore(storeFile) {
  if (!fs.existsSync(storeFile)) return { entries: [] };
  try { return JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch { return { entries: [] }; }
}

function saveStore(storeFile, data) {
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify(data, null, 2));
}

function applyOverride({ actuator, tier, reason, until }, storeFile = DEFAULT_STORE) {
  const data = loadStore(storeFile);
  data.entries.push({ actuator, tier, reason, until: until || null, reset: false, timestamp: new Date().toISOString() });
  saveStore(storeFile, data);
}

function resetOverride({ actuator, reason }, storeFile = DEFAULT_STORE) {
  const data = loadStore(storeFile);
  data.entries.push({ actuator, reason, reset: true, timestamp: new Date().toISOString() });
  saveStore(storeFile, data);
}

function activeOverrides(storeFile = DEFAULT_STORE) {
  const data = loadStore(storeFile);
  const now = Date.now();
  const latestPerActuator = {};
  for (const entry of data.entries) latestPerActuator[entry.actuator] = entry;
  return Object.values(latestPerActuator).filter(entry => {
    if (entry.reset) return false;
    if (entry.until && new Date(entry.until).getTime() < now) return false;
    return true;
  });
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.reset) { resetOverride(args); console.log(`reset: ${args.actuator}`); }
    else { applyOverride(args); console.log(`override: ${args.actuator} → ${args.tier}`); }
    process.exit(0);
  } catch (e) { console.error(`error: ${e.message}`); process.exit(1); }
}

module.exports = { parseArgs, applyOverride, resetOverride, activeOverrides,
  ALLOWED_ACTUATORS, ALLOWED_TIERS, DEFAULT_STORE };
