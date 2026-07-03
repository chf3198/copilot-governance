#!/usr/bin/env node
'use strict';
// anneal-audit-sensor.js — AC9 (#1133/#1222)
// Reads incidents.jsonl and returns anneal signal counts for governance-audit.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const INCIDENTS = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
const SUPPRESSION = path.join(os.homedir(), '.megingjord', 'suppression-registry.json');
const WINDOW_DAYS = 30;

function readLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n')
    .filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function windowCutoff() {
  return new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
}

function readSuppressions() {
  if (!fs.existsSync(SUPPRESSION)) return [];
  try { return JSON.parse(fs.readFileSync(SUPPRESSION, 'utf8')); } catch { return []; }
}

function compute(opts = {}) {
  const incidentsFile = opts.incidentsFile || INCIDENTS;
  const cutoff = windowCutoff();
  const events = readLines(incidentsFile)
    .filter(e => (e.timestamp || e.bucketed_at || '') >= cutoff);

  const pending = events.filter(e => e.status === 'pending' || !e.status).length;
  const proposed = events.filter(e => e.status === 'proposed').length;
  const resolved = events.filter(e => e.status === 'resolved').length;

  const patternCounts = {};
  for (const e of events) {
    const id = e.pattern_id || e.sensor || 'unknown';
    patternCounts[id] = (patternCounts[id] || 0) + 1;
  }
  const top = Object.entries(patternCounts).sort((a, b) => b[1] - a[1])[0];
  const top_pattern = top ? { pattern_id: top[0], count: top[1] } : null;

  const suppressions = readSuppressions();
  const active_suppressions = suppressions.filter(
    s => !s.expires_utc || s.expires_utc > new Date().toISOString()
  ).length;

  return {
    window_days: WINDOW_DAYS,
    total_events: events.length,
    pending,
    proposed,
    resolved,
    top_pattern,
    active_suppressions,
  };
}

if (require.main === module) {
  const result = compute();
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { compute, readLines, readSuppressions, INCIDENTS, SUPPRESSION };
