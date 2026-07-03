#!/usr/bin/env node
'use strict';
// tier: 1
// gate-failure-tier1 (Epic #2709 / #2706 AC2): the auto-Tier-1 bridge. When an
// operator-caused governed gate goes red and is remediated in-session, this emits
// the Tier-1 incident that the self-anneal recurrence detector counts - so escalation
// no longer depends on the operator REMEMBERING to log it (the #2703 break). Pure
// logic (unit-testable); the caller injects the append path.
const fs = require('fs');
const path = require('path');

function buildTier1Event(opts = {}) {
  return {
    ts: opts.ts || new Date().toISOString(),
    version: 3,
    service: 'gate-failure-tier1-bridge',
    env: 'local',
    event: 'governance.gate-failure-operator-caused',
    pattern_id: opts.patternId || `gate-failure-${opts.gate || 'unknown'}`,
    severity: opts.severity || 'medium',
    trigger_role: opts.role || 'admin',
    gate: opts.gate || null,
    ticket: opts.ticket || null,
    _summary: opts.summary || `operator-caused failure of gate '${opts.gate || 'unknown'}' (remediated in-session)`,
  };
}

function defaultPath() {
  return path.join(process.env.HOME || '.', '.megingjord', 'incidents.jsonl');
}

function appendTier1Incident(event, opts = {}) {
  const incidentsPath = opts.incidentsPath || defaultPath();
  fs.mkdirSync(path.dirname(incidentsPath), { recursive: true });
  fs.appendFileSync(incidentsPath, JSON.stringify(event) + '\n');
  return event.pattern_id;
}

function emitGateFailure(opts = {}) {
  return appendTier1Incident(buildTier1Event(opts), opts);
}

module.exports = { buildTier1Event, appendTier1Incident, emitGateFailure, defaultPath };
