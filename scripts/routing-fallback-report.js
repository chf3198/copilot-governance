#!/usr/bin/env node
// tier: 2
// routing-fallback-report.js — Aggregates routing-fallback.jsonl per role per week.
// Emits Tier-2 anneal when any role's fallback-rate > FALLBACK_THRESHOLD. Refs #2351.
'use strict';

const MS_PER_DAY = 86400000;

const fs = require('fs');
const path = require('path');
const os = require('os');

const FALLBACK_LOG = path.join(os.homedir(), '.megingjord', 'routing-fallback.jsonl');
const INCIDENTS_LOG = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
const FALLBACK_THRESHOLD = Number(process.env.ROUTING_FALLBACK_THRESHOLD ?? 0.25);
const SERVICE = 'routing-fallback-report';

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function isoWeekKey(ts) {
  const date = new Date(ts);
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday - yearStart) / MS_PER_DAY + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function aggregateByRoleWeek(events) {
  const counts = {};
  for (const ev of events) {
    const role = ev.role || 'unknown';
    const week = isoWeekKey(ev.ts || new Date().toISOString());
    const key = `${role}::${week}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function buildTier2Event(role, week, count, threshold) {
  return {
    version: 3,
    ts: new Date().toISOString(),
    service: SERVICE,
    env: 'local',
    event: 'anneal.tier2',
    tier: 'tier-2',
    trigger_type: 'auto',
    trigger_role: 'system',
    severity: 'medium',
    pattern_id: `routing-fallback-rate-exceeded:${role}:${week}`,
    evidence: `role=${role} week=${week} count=${count} threshold=${threshold}`,
    _summary: `Tier-2: fallback rate for role=${role} week=${week} exceeds ${threshold * 100}%`,
  };
}

function emitTier2(event) {
  try {
    const dir = path.dirname(INCIDENTS_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(INCIDENTS_LOG, JSON.stringify(event) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

function printReport(events, counts, annealsFired) {
  console.log('\n=== Routing Fallback Report ===');
  console.log(`threshold: ${FALLBACK_THRESHOLD * 100}% (set ROUTING_FALLBACK_THRESHOLD to override)`);
  console.log(`total events: ${events.length}\n`);
  console.log('role :: week => count  [status]');
  console.log('-------------------------------');
  for (const [key, count] of Object.entries(counts).sort()) {
    const [role, week] = key.split('::');
    const exceeded = count > Math.round(events.length * FALLBACK_THRESHOLD);
    const status = exceeded ? 'THRESHOLD EXCEEDED — Tier-2 emitted' : 'ok';
    console.log(`  ${role} :: ${week} => ${count} events  [${status}]`);
    if (exceeded) {
      const tier2 = buildTier2Event(role, week, count, FALLBACK_THRESHOLD);
      emitTier2(tier2);
      annealsFired.push({ role, week, count });
    }
  }
  console.log('\n==============================\n');
}

function run() {
  const events = readLines(FALLBACK_LOG);
  if (events.length === 0) {
    console.log('routing-fallback-report: no fallback events recorded.');
    return { counts: {}, annealsFired: [] };
  }

  const counts = aggregateByRoleWeek(events);
  const annealsFired = [];

  printReport(events, counts, annealsFired);
}

if (require.main === module) run();
module.exports = { run, aggregateByRoleWeek, buildTier2Event, isoWeekKey, FALLBACK_LOG };
