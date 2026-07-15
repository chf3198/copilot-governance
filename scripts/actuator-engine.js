#!/usr/bin/env node
'use strict';
// actuator-engine (#1258 / Epic #1113 AC4) — invokes 7 pure-function actuators per Phase-0 §3.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { applyTransition } = require('./actuator-transitions.js');

const DEFAULT_STORE = path.join(os.homedir(), '.megingjord', 'goal-tier-state.json');
const TIERS = ['B', 'B+', 'B++', 'B+++', 'B++++'];
const A1_THRESHOLDS = [0.80, 0.65, 0.50, 0.35];
const INIT_ACTUATOR = { escalated_at: null, deescalation_eligible_at: null, consecutive_clean_count: 0 };
const INITIAL_STATE = {
  ghs_7d: null, ghs_history: [],
  actuators: {
    A1: { ...INIT_ACTUATOR, tier: 'B' },
    A2: { ...INIT_ACTUATOR, level: 'advisory' },
    A3: { ...INIT_ACTUATOR, handoff_block_required: false },
    A4: { ...INIT_ACTUATOR, consultant_mandatory: false },
    A5: { ...INIT_ACTUATOR, operator_notification: false },
    A6: { ...INIT_ACTUATOR, session_reminder: false },
    A7: { ...INIT_ACTUATOR, anneal_auto_trigger: false },
  },
};

function tierForGHS(ghs) {
  for (let i = 0; i < A1_THRESHOLDS.length; i += 1) {
    if (ghs < A1_THRESHOLDS[i]) continue;
    return TIERS[i === 0 ? 0 : i];
  }
  return TIERS[TIERS.length - 1];
}

function tierFromGHS(ghs) {
  let tier = TIERS[0];
  for (let i = 0; i < A1_THRESHOLDS.length; i += 1) if (ghs < A1_THRESHOLDS[i]) tier = TIERS[i + 1];
  return tier;
}

function actuator(key, escalateFn, fieldsFn) {
  return ({ ghs, prevState, now }) => {
    const prev = (prevState && prevState[key]) || INITIAL_STATE.actuators[key];
    if (ghs === null) return prev;
    return applyTransition(prev, escalateFn(ghs), now, fieldsFn(ghs));
  };
}

const actuators = {
  A1: actuator('A1', g => g < A1_THRESHOLDS[0], g => ({ tier: tierFromGHS(g) })),
  A2: actuator('A2', g => g < 0.70, g => ({ level: g < 0.70 ? 'required' : 'advisory' })),
  A3: actuator('A3', g => g < 0.65, g => ({ handoff_block_required: g < 0.65 })),
  A4: actuator('A4', g => g < 0.55, g => ({ consultant_mandatory: g < 0.55 })),
  A5: actuator('A5', g => g < 0.60, g => ({ operator_notification: g < 0.60 })),
  A6: actuator('A6', g => g < 0.75, g => ({ session_reminder: g < 0.75 })),
  A7: actuator('A7', g => g < 0.45, g => ({ anneal_auto_trigger: g < 0.45 })),
};

function loadState(storeFile) {
  if (!fs.existsSync(storeFile)) return JSON.parse(JSON.stringify(INITIAL_STATE));
  try { return JSON.parse(fs.readFileSync(storeFile, 'utf8')); }
  catch { return JSON.parse(JSON.stringify(INITIAL_STATE)); }
}

function runEngine({ ghs, sensors = {}, now = Date.now() }, storeFile = DEFAULT_STORE) {
  const prev = loadState(storeFile);
  const newActuators = {};
  for (const key of Object.keys(actuators)) newActuators[key] = actuators[key]({ ghs, prevState: prev.actuators, sensors, now });
  const next = { ghs_7d: ghs, ghs_history: [...(prev.ghs_history || []), { ts: new Date(now).toISOString(), value: ghs }],
    actuators: newActuators };
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify(next, null, 2));
  return next;
}

if (require.main === module) {
  const ghs = Number(process.argv[2]);
  console.log(JSON.stringify(runEngine({ ghs: Number.isFinite(ghs) ? ghs : null }), null, 2));
}

module.exports = { actuators, runEngine, INITIAL_STATE, tierForGHS, TIERS, A1_THRESHOLDS, DEFAULT_STORE };
