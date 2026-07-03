#!/usr/bin/env node
'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');

const REPORT_FILE = '/tmp/governance-audit.json';
const DEP_HEALTH = require('./dep-graph-health');
const ANNEAL_SENSOR = require('./anneal-audit-sensor');
const GIT_STATE_DRIFT = require('./git-state-drift-sensor');
const WORKER_SIGNATURE = require('./worker-signature-governance');
const CHECKS = ['governance:drift', 'governance:verify', 'governance:reconcile', 'governance:worktrees'];
const TIMEOUT_MS = 60_000;
const RAW_PREVIEW_MAX = 500;
const ERR_PREVIEW_MAX = 300;
const TICKET_FETCH_LIMIT = 200;

function runCheck(name) {
  try {
    const out = execSync(`npm run --silent ${name}`, { encoding: 'utf8', timeout: TIMEOUT_MS });
    let parsed = null;
    try { parsed = JSON.parse(out); } catch { parsed = { raw: out.slice(0, RAW_PREVIEW_MAX) }; }
    return { name, ok: true, result: parsed };
  } catch (err) {
    return { name, ok: false, error: err.message.slice(0, ERR_PREVIEW_MAX) };
  }
}

function listOpenTickets() {
  try {
    const cmd = `gh issue list --state open --limit ${TICKET_FETCH_LIMIT} --json number,title,labels,body --jq ".[] | {number, title, body, labels: [.labels[].name]}"`;
    const out = execSync(cmd, { encoding: 'utf8', timeout: TIMEOUT_MS });
    return out.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (err) { return []; }
}

function detectViolations(tickets) {
  const violations = [];
  for (const ticket of tickets) {
    const labels = ticket.labels || [];
    const status = labels.find(l => l.startsWith('status:')) || null;
    const roles = labels.filter(l => l.startsWith('role:'));
    const isEpic = labels.includes('type:epic');
    if (status === 'status:backlog' && roles.length > 0 && !isEpic) {
      violations.push({ ticket: ticket.number, rule: 'Rule 4', detail: `non-Epic backlog with ${roles.join(',')}` });
    }
    if (status === 'status:in-progress' && !labels.includes('role:collaborator') && !isEpic) {
      violations.push({ ticket: ticket.number, rule: 'Rule 8', detail: 'in-progress missing role:collaborator' });
    }
    if (isEpic && status === 'status:backlog' && !labels.includes('role:manager')) {
      violations.push({ ticket: ticket.number, rule: 'Rule E2', detail: 'Epic backlog missing role:manager' });
    }
    detectTitleBodyDrift(ticket, violations);
  }
  return violations;
}

// Three governance-audit checks for title-case and body-structure drift.
function detectTitleBodyDrift(ticket, violations) {
  if (ticket.title && /^[a-z]/.test(ticket.title)) {
    violations.push({ ticket: ticket.number, rule: 'title-case',
      detail: `title starts with lowercase: "${ticket.title.slice(0, 60)}"` });
  }
  if (ticket.title && /^[a-z]+(\([^)]+\))?:\s/.test(ticket.title)) {
    violations.push({ ticket: ticket.number, rule: 'title-conventional-prefix',
      detail: `commit-style prefix in issue title: "${ticket.title.slice(0, 60)}"` });
  }
  const body = ticket.body || '';
  if (body.length > 0 && !/^##\s+(Summary|Problem|Goal|Why|Acceptance Criteria)/im.test(body)) {
    violations.push({ ticket: ticket.number, rule: 'body-structure',
      detail: 'body missing structured section (Summary/Problem/Goal/Why/Acceptance Criteria)' });
  }
}

function computeGoalHealth(violationCount) {
  try {
    const { computeGHS } = require('./goal-health-score');
    const { aggregate } = require('./sensors');
    const { fetchAll } = require('./sensors/fetch-data');
    const sensorValues = aggregate(fetchAll(violationCount));
    return computeGHS({ sensorValues });
  } catch { return null; }
}

function readOperatorOverrides() {
  try { return require('./goal-tier-override').activeOverrides(); } catch { return []; }
}

function runActuatorEngine(goalHealth) {
  try {
    const ghs = goalHealth && Number.isFinite(goalHealth.score) ? goalHealth.score : null;
    return require('./actuator-engine').runEngine({ ghs }).actuators;
  } catch { return null; }
}

function loadHamrSensor(violations) {
  let hamrSensor = null;
  try { hamrSensor = require('./hamr-utilization-sensor').compute(); } catch { /* optional */ }
  const rules = { violation: ['utilization-floor', 'floor'], escalation: ['utilization-escalation', 'escalation'] };
  if (hamrSensor && rules[hamrSensor.status]) {
    const [rule, label] = rules[hamrSensor.status], limit = hamrSensor.thresholds[hamrSensor.status];
    violations.push({ ticket: 'HAMR', rule,
      detail: `production_hamr_utilization_rate_7d=${hamrSensor.rate?.toFixed(2)} below ${label} ${limit}` });
  }
  return hamrSensor;
}

async function audit(opts = {}) {
  const startedAt = new Date().toISOString();
  const checks = CHECKS.map(runCheck);
  const gitStateDrift = GIT_STATE_DRIFT.compute();
  const tickets = listOpenTickets();
  const violations = detectViolations(tickets);
  const workerSignatureCompliance = WORKER_SIGNATURE.summarizeTickets(tickets);
  for (const signatureViolation of workerSignatureCompliance.violations) {
    violations.push({
      ticket: signatureViolation.ticket,
      rule: signatureViolation.rule,
      detail: signatureViolation.detail,
    });
  }
  for (const driftViolation of gitStateDrift.violations || []) {
    violations.push({
      ticket: 'GIT-STATE',
      rule: `git_state_drift:${driftViolation.signal}`,
      detail: `${driftViolation.status} — ${driftViolation.detail}. ${driftViolation.guidance}`,
    });
  }
  const hamrSensor = loadHamrSensor(violations);
  const dependencyHealth = DEP_HEALTH.compute(opts.dependencyHealth || {});
  dependencyHealth.cycles.forEach(cycle =>
    violations.push({ ticket: 'DEP-GRAPH', rule: 'dependency-cycle', detail: cycle }));
  const goalHealth = computeGoalHealth(violations.length);
  const operatorOverridesActive = readOperatorOverrides();
  const actuatorState = runActuatorEngine(goalHealth);
  let annealSignals = null;
  try { annealSignals = ANNEAL_SENSOR.compute(); } catch { /* optional */ }
  const summary = {
    schema_version: 4, started_at: startedAt, completed_at: new Date().toISOString(),
    checks: checks.map(c => ({ name: c.name, ok: c.ok, error: c.error || null })),
    open_tickets: tickets.length, violations, hamr_utilization: hamrSensor,
    git_state_drift: gitStateDrift,
    dependency_health: dependencyHealth, goal_health: goalHealth,
    worker_signature_compliance: workerSignatureCompliance,
    operator_overrides_active: operatorOverridesActive,
    actuator_state: actuatorState,
    anneal_signals: annealSignals,
    overall: violations.length === 0 && checks.every(c => c.ok) ? 'PASS' : 'FAIL',
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(summary, null, 2));
  return summary;
}

if (require.main === module) {
  audit().then(s => {
    const status = s.overall;
    const failed = s.checks.filter(c => !c.ok).length;
    console.log(`governance-audit: ${status} | open=${s.open_tickets} violations=${s.violations.length} failed-checks=${failed} → ${REPORT_FILE}`);
    const MAX_PRINTED = 10;
    for (const violation of s.violations.slice(0, MAX_PRINTED)) {
      console.log(`  ! #${violation.ticket} ${violation.rule}: ${violation.detail}`);
    }
    process.exit(status === 'PASS' ? 0 : 1);
  }).catch(err => { console.error('governance-audit error:', err.message); process.exit(2); });
}

module.exports = { audit, runCheck, listOpenTickets, detectViolations, REPORT_FILE, CHECKS, DEP_HEALTH };
