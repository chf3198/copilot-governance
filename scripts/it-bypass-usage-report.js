#!/usr/bin/env node
// tier: 2
// it-bypass-usage-report.js — Aggregates it-bypass-usage.jsonl per marker per week.
// Emits Tier-2 anneal when any marker's usage > IT_BYPASS_THRESHOLD per week. Refs #2351.
'use strict';

const MS_PER_DAY = 86400000;

const fs = require('fs');
const path = require('path');
const os = require('os');

const BYPASS_LOG = path.join(os.homedir(), '.megingjord', 'it-bypass-usage.jsonl');
const INCIDENTS_LOG = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
const IT_BYPASS_THRESHOLD = Number(process.env.IT_BYPASS_THRESHOLD ?? 5);
const SERVICE = 'it-bypass-usage-report';

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

function aggregateByMarkerWeek(events) {
  const counts = {};
  for (const ev of events) {
    const marker = ev.marker || 'unknown';
    const week = isoWeekKey(ev.ts || new Date().toISOString());
    const key = `${marker}::${week}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function buildTier2Event(marker, week, count, threshold) {
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
    pattern_id: `it-bypass-usage-exceeded:${marker}:${week}`,
    evidence: `marker=${marker} week=${week} count=${count} threshold=${threshold}`,
    _summary: `Tier-2: IT-bypass marker=${marker} week=${week} count=${count} > ${threshold}/week`,
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
  console.log('\n=== IT-Bypass Usage Report ===');
  console.log(`threshold: ${IT_BYPASS_THRESHOLD} events/week (set ROUTING_IT_BYPASS_THRESHOLD to override)`);
  console.log(`total events: ${events.length}\n`);
  console.log('role :: week => count  [status]');
  console.log('-------------------------------');
  for (const [key, count] of Object.entries(counts).sort()) {
    const [role, week] = key.split('::');
    const exceeded = count > IT_BYPASS_THRESHOLD;
    const status = exceeded ? 'THRESHOLD EXCEEDED — Tier-2 emitted' : 'ok';
    console.log(`  ${role} :: ${week} => ${count} events  [${status}]`);
    if (exceeded) {
      const tier2 = buildTier2Event(role, week, count, IT_BYPASS_THRESHOLD);
      emitTier2(tier2);
      annealsFired.push({ role, week, count });
    }
  }
  console.log('\n==============================\n');
}

function run() {
  const events = readLines(BYPASS_LOG);
  if (events.length === 0) {
    console.log('it-bypass-usage-report: no bypass events recorded.');
    return { counts: {}, annealsFired: [] };
  }

  const counts = aggregateByMarkerWeek(events);
  const annealsFired = [];

  printReport(events, counts, annealsFired);
}

if (require.main === module) run();
module.exports = { run, aggregateByMarkerWeek, buildTier2Event, isoWeekKey, BYPASS_LOG };
