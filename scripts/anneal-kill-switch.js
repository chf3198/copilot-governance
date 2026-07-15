#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const MAX_STEPS = Number('50');
const MAX_PATTERN_PER_WEEK = Number('5');
const WEEK_MS = Number('604800000');
const LOCK_FILE = path.join(os.homedir(), '.megingjord', 'anneal-tier2.lock');

function stepGate(stepCount, maxSteps = MAX_STEPS) {
  return stepCount <= maxSteps ? { ok: true } : { ok: false, reason: 'step-counter' };
}

function patternRateGate(events, patternId, nowMs) {
  const count = events.filter((item) => item.pattern_id === patternId)
    .filter((item) => nowMs - Date.parse(item.timestamp) <= WEEK_MS).length;
  return count < MAX_PATTERN_PER_WEEK ? { ok: true } : { ok: false, reason: 'rate-limit' };
}

function singleFlightGate(sessionId) {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  if (!fs.existsSync(LOCK_FILE)) {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ session_id: sessionId }));
    return { ok: true };
  }
  const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
  return lock.session_id === sessionId ? { ok: true } : { ok: false, reason: 'single-flight' };
}

function releaseSingleFlight() {
  if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
}

module.exports = { stepGate, patternRateGate, singleFlightGate, releaseSingleFlight, LOCK_FILE, MAX_STEPS };
