#!/usr/bin/env node
// Escalation reason telemetry coverage gate (#1797).
// Counts escalation events and what fraction carry a non-empty escalation_reason.
// Fails (exit 1) when coverage falls below COVERAGE_TARGET (default 95%).
'use strict';

const { readCostEvents } = require('./cost-telemetry');

const COVERAGE_TARGET = Number(process.env.MEGINGJORD_ESCALATION_COVERAGE_TARGET || '95');
const ESCALATION_OUTCOMES = new Set(['fail', 'escalated', 'fallback']);

function isEscalation(event) {
  return ESCALATION_OUTCOMES.has(String(event.outcome || '').toLowerCase());
}

function computeCoverage(events) {
  const escalations = events.filter(isEscalation);
  if (escalations.length === 0) {
    return { total: 0, withReason: 0, coverage: null, topReasons: [] };
  }
  const withReason = escalations.filter(e => e.escalation_reason && String(e.escalation_reason).trim()).length;
  const coverage = +((withReason / escalations.length) * 100).toFixed(1);
  const reasonCounts = new Map();
  for (const e of escalations) {
    if (!e.escalation_reason) continue;
    const key = String(e.escalation_reason);
    reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
  }
  const topReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));
  return { total: escalations.length, withReason, coverage, topReasons };
}

function run({ days = 30, target = COVERAGE_TARGET, events = null } = {}) {
  const data = events || readCostEvents(days);
  const result = computeCoverage(data);
  const ok = result.total === 0 || (result.coverage !== null && result.coverage >= target);
  return { ok, target, days, ...result };
}

if (require.main === module) {
  const json = process.argv.includes('--json');
  const daysIdx = process.argv.indexOf('--days');
  const days = daysIdx !== -1 ? Number(process.argv[daysIdx + 1]) : 30;
  const result = run({ days });
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (result.total === 0) {
    process.stdout.write(`✓ no escalation events in last ${days}d (gate skipped)\n`);
  } else if (result.ok) {
    process.stdout.write(`✓ escalation coverage ${result.coverage}% over ${result.total} events (≥${result.target}% target)\n`);
    if (result.topReasons.length) {
      process.stdout.write('  top drivers:\n');
      for (const { reason, count } of result.topReasons) {
        process.stdout.write(`    ${count}× ${reason}\n`);
      }
    }
  } else {
    process.stderr.write(`✗ escalation coverage ${result.coverage}% below ${result.target}% target (${result.withReason}/${result.total} events have non-empty escalation_reason)\n`);
    process.stderr.write('  callers emitting escalation events MUST pass {escalation_reason: "..."} to recordCostEvent\n`');
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = { run, computeCoverage, isEscalation, ESCALATION_OUTCOMES, COVERAGE_TARGET };
