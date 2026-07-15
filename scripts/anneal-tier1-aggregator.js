#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { emitEvent, readEvents } = require('./anneal-event-schema');

const SIX_HOURS_MS = Number('21600000');
const ONE = Number('1');
const TWO = Number('2');
const THREE = Number('3');
const INCIDENTS = path.join(require('node:os').homedir(), '.megingjord', 'incidents.jsonl');

function bucketTimestamp(nowMs) {
  const bucketMs = Math.floor(nowMs / SIX_HOURS_MS) * SIX_HOURS_MS;
  return new Date(bucketMs).toISOString();
}

function loadSensors(fixturePath) {
  if (fixturePath) return JSON.parse(fs.readFileSync(fixturePath, 'utf8')).sensors || {};
  const classifier = require('./governance-drift-classifier');
  const gitState = require('./git-state-drift-sensor');
  const hamr = require('./hamr-utilization-sensor');
  return {
    governance: classifier.buildReport({ issues: [], checkedTickets: Number('0'), failedChecks: Number('0') }),
    git_state: gitState.compute(),
    hamr: hamr.compute(),
  };
}

function sensorEvents(sensors, timestamp, sessionId) {
  const events = [];
  const governanceTotal = Number((sensors.governance || {}).totalDrift || '0');
  if (governanceTotal > Number('0')) {
    events.push({ pattern_id: 'tier1-governance-drift', severity: 'high', evidence: [`drift=${governanceTotal}`] });
  }
  if ((sensors.git_state || {}).status === 'FAIL') {
    const count = Number((sensors.git_state || {}).violation_count || '0');
    events.push({ pattern_id: 'tier1-git-state-drift', severity: 'medium', evidence: [`violations=${count}`] });
  }
  const hamrRate = (sensors.hamr || {}).rate;
  if (typeof hamrRate === 'number' && hamrRate < Number('0.8')) {
    events.push({ pattern_id: 'tier1-hamr-utilization', severity: 'medium', evidence: [`rate=${hamrRate}`] });
  }
  return events.map((item) => ({
    version: TWO, timestamp, tier: ONE, trigger_role: 'system', trigger_type: 'sensor-driven',
    pattern_id: item.pattern_id, severity: item.severity, evidence: item.evidence,
    ticket_ref: null, epic_ref: '#1308', session_id: sessionId,
    schema_compat: 'v1-readers-must-ignore-fields-not-in-v1',
  }));
}

function buildEventKey(item) {
  const evidence = Array.isArray(item.evidence) ? item.evidence.join('||') : '';
  return [item.pattern_id || '', item.timestamp || '', item.trigger_type || '', item.severity || '', evidence].join('|');
}

function dedupe(newEvents, filePath) {
  const prior = new Set(readEvents(filePath).map(buildEventKey));
  return newEvents.filter((item) => !prior.has(buildEventKey(item)));
}

function run(argv) {
  const fixtureIdx = argv.indexOf('--fixture');
  const fixturePath = fixtureIdx > -ONE ? argv[fixtureIdx + ONE] : '';
  const dryRun = argv.includes('--dry-run');
  const outIdx = argv.indexOf('--out');
  const outFile = outIdx > -ONE ? argv[outIdx + ONE] : '';
  const nowMs = Date.now();
  const timestamp = bucketTimestamp(nowMs);
  const sessionId = process.env.GITHUB_RUN_ID || `local-${timestamp}`;
  const events = dedupe(sensorEvents(loadSensors(fixturePath), timestamp, sessionId), INCIDENTS);
  if (dryRun || outFile) {
    const json = JSON.stringify({ added: events.length, events }, null, TWO);
    if (outFile) fs.writeFileSync(outFile, json + '\n');
    else process.stdout.write(json + '\n');
    return { added: events.length, events };
  }
  events.forEach((item) => emitEvent(item, INCIDENTS));
  process.stdout.write(JSON.stringify({ added: events.length }, null, TWO) + '\n');
  return { added: events.length, events };
}

if (require.main === module) run(process.argv.slice(TWO));
module.exports = { bucketTimestamp, sensorEvents, dedupe, run, THREE };
