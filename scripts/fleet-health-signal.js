#!/usr/bin/env node
'use strict';
// tier: 3
// fleet-health-signal (#3305) — turns a SILENT fleet availability outage into a
// LOUD, observable signal. Distinguishes an OUTAGE (fleet probed unreachable while
// fleet-eligible work was attempted and failed over) from NO-DEMAND (no fleet work
// this window) so silent underutilization cannot masquerade as ordinary low share.
// Reuses fleet-probe (#2521) decision vocab + the v3/incident emitters; no new detector.
// Refs #1790 (utilization gate), #2521 (probe), #3174 (doctor), #2621 (silent failover).

const path = require('node:path');
const os = require('node:os');
const { emitV3 } = require('./event-schema-v3');

const PATTERN_ID = 'fleet-availability-outage';
const SUMMARY_MAX_CHARS = 200; // event-schema-v3 _summary field cap
const isDisabled = () => process.env.FLEET_HEALTH_SIGNAL_DISABLED === '1';

// Pure classification of one window from already-collected facts (IO injected upstream).
//   probeDecision: 'AVAILABLE'|'WAIT'|'BUSY'|'UNAVAILABLE' (fleet-probe #2521 vocab)
//   fleetEligibleAttempts: calls routed to the fleet lane this window
//   failovers: those that fell off the fleet lane (free-cloud/paid)
function classifyFleetWindow({ probeDecision, fleetEligibleAttempts = 0, failovers = 0 } = {}) {
  const reachable = Boolean(probeDecision) && probeDecision !== 'UNAVAILABLE';
  if (fleetEligibleAttempts < 1) {
    return { state: 'no-demand', reason: 'no fleet-eligible work attempted this window' };
  }
  if (!reachable) {
    const detail = failovers >= 1
      ? `fleet UNAVAILABLE while ${failovers}/${fleetEligibleAttempts} fleet calls failed over`
      : 'fleet UNAVAILABLE during a window with fleet-eligible demand';
    return { state: 'outage', reason: detail };
  }
  return { state: 'healthy', reason: 'fleet reachable and serving demand' };
}

// Build the two observable v3 events for an outage (does not write — emit step writes).
function buildOutageEvents(classification, opts = {}) {
  const ts = opts.ts || new Date().toISOString();
  const env = opts.env || 'local';
  const incident = {
    ts, version: 3, service: 'fleet-health-signal', env, event: 'fleet-availability-outage',
    pattern_id: PATTERN_ID, severity: 'medium', trigger_type: 'fleet-availability',
    trigger_role: 'system', _summary: `Fleet outage: ${classification.reason}`.slice(0, SUMMARY_MAX_CHARS),
  };
  const dashboard = {
    ts, version: 3, service: 'fleet-health-signal', env, event: 'fleet-health',
    state: classification.state, reason: classification.reason, trigger_role: 'system',
    _summary: `fleet-health=${classification.state}`.slice(0, SUMMARY_MAX_CHARS),
  };
  return { incident, dashboard };
}

// Orchestrate: classify, and on OUTAGE emit both signals. IO injected for tests.
function emitFleetHealthSignal(facts = {}, opts = {}) {
  if (isDisabled()) return { state: 'disabled', emitted: false };
  const classification = classifyFleetWindow(facts);
  if (classification.state !== 'outage') return { ...classification, emitted: false };
  const { incident, dashboard } = buildOutageEvents(classification, opts);
  const emit = opts.emit || emitV3;
  const incidentsPath = opts.incidentsPath
    || path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
  const dashboardPath = opts.dashboardPath
    || path.join(__dirname, '..', '..', 'dashboard', 'events.jsonl');
  try {
    emit(incident, incidentsPath);
    emit(dashboard, dashboardPath);
    return { ...classification, emitted: true, pattern_id: PATTERN_ID };
  } catch (err) {
    // G6: a health signal must never hard-throw; degrade to a non-emitting result.
    return { ...classification, emitted: false, error: err.message };
  }
}

// AC3: annotate a cascade-gate low-utilization finding when an outage explains it,
// so an outage-caused low-share week is flagged as an incident, not a silent pass.
function annotateUtilizationFinding(finding = {}, classification = {}) {
  if (classification.state !== 'outage') return finding;
  return {
    ...finding, outageCaused: true, pattern_id: PATTERN_ID,
    note: `low fleet utilization attributable to availability outage: ${classification.reason}`,
  };
}

module.exports = {
  classifyFleetWindow, buildOutageEvents, emitFleetHealthSignal,
  annotateUtilizationFinding, PATTERN_ID,
};
