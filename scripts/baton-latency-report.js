#!/usr/bin/env node
'use strict';
// baton-latency-report.js — aggregate per-role-transition latency from
// .dashboard/events.jsonl baton:* events. Refs #2063.
const fs = require('node:fs');
const path = require('node:path');

const BATON_TYPES = new Set([
  'baton:manager', 'baton:collaborator', 'baton:admin', 'baton:consultant',
  'baton:handoff', 'baton:merged',
]);

function readEvents(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (!BATON_TYPES.has(e.type)) continue;
      if (!e.issue || !e.ts || !e.role) continue;
      out.push({ ts: String(e.ts), issue: Number(e.issue), role: String(e.role) });
    } catch { /* skip-malformed */ }
  }
  return out;
}

function groupByIssue(events) {
  const by = new Map();
  for (const e of events) {
    if (!by.has(e.issue)) by.set(e.issue, []);
    by.get(e.issue).push(e);
  }
  for (const arr of by.values()) arr.sort((a, b) => a.ts.localeCompare(b.ts));
  return by;
}

function transitions(byIssue) {
  const deltas = new Map();
  for (const events of byIssue.values()) {
    for (let i = 1; i < events.length; i += 1) {
      const prev = events[i - 1];
      const curr = events[i];
      if (prev.role === curr.role) continue;
      const dtMs = new Date(curr.ts).getTime() - new Date(prev.ts).getTime();
      if (!Number.isFinite(dtMs) || dtMs < 0) continue;
      const key = `${prev.role}->${curr.role}`;
      if (!deltas.has(key)) deltas.set(key, []);
      deltas.get(key).push(dtMs);
    }
  }
  return deltas;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summarize(deltas) {
  const out = {};
  for (const [key, arr] of deltas) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const sum = sorted.reduce((s, x) => s + x, 0);
    out[key] = {
      count: sorted.length,
      mean_ms: Math.round(sum / sorted.length),
      p50_ms: percentile(sorted, 50),
      p95_ms: percentile(sorted, 95),
      p99_ms: percentile(sorted, 99),
    };
  }
  return out;
}

function generate(filePath) {
  const events = readEvents(filePath);
  const byIssue = groupByIssue(events);
  return {
    schema: 'baton-latency-report/v1',
    generated_at: new Date().toISOString(),
    source: filePath,
    tickets_covered: byIssue.size,
    transitions: summarize(transitions(byIssue)),
  };
}

function defaultPath() {
  return path.join(process.cwd(), '.dashboard', 'events.jsonl');
}

if (require.main === module) {
  const filePath = process.argv[2] || defaultPath();
  process.stdout.write(`${JSON.stringify(generate(filePath), null, 2)}\n`);
}

module.exports = {
  readEvents, groupByIssue, transitions, summarize, percentile, generate, defaultPath,
};
