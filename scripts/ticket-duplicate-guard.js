#!/usr/bin/env node
// Ticket duplicate guard (#1765) — detects same-actor same-title issue creation
// within a configurable time window, preventing the Codex-filed-twice pattern.
'use strict';

const { execFileSync } = require('node:child_process');

const DEFAULT_WINDOW_MIN = parseInt(process.env.MEGINGJORD_DUPLICATE_WINDOW_MIN || '10', 10);

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?'"`]/g, '')
    .trim();
}

function withinWindow(aIso, bIso, windowMin) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!a || !b) return false;
  return Math.abs(a - b) <= windowMin * 60_000;
}

function findRapidDuplicates(issues, windowMin = DEFAULT_WINDOW_MIN) {
  const sorted = [...issues].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const groups = new Map();
  for (const issue of sorted) {
    const key = normalizeTitle(issue.title);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(issue);
  }
  const pairs = [];
  for (const [key, items] of groups) {
    if (items.length < 2) continue;
    for (let i = 1; i < items.length; i++) {
      if (withinWindow(items[i - 1].createdAt, items[i].createdAt, windowMin)) {
        pairs.push({ canonical: items[i - 1], duplicate: items[i], normalizedTitle: key });
      }
    }
  }
  return pairs;
}

function ghIssueList(opts = {}) {
  const { state = 'all', limit = 200, runner = execFileSync } = opts;
  const out = runner('gh', ['issue', 'list', '--state', state, '--limit', String(limit),
    '--json', 'number,title,createdAt,state,author'], { encoding: 'utf8' });
  return JSON.parse(out);
}

function checkMode(title, opts = {}) {
  const { issues = ghIssueList(opts), windowMin = DEFAULT_WINDOW_MIN } = opts;
  const target = normalizeTitle(title);
  const matches = issues.filter(i => normalizeTitle(i.title) === target);
  return { ok: matches.length === 0, matches, canonical: matches[0] || null };
}

function scanMode(opts = {}) {
  const { issues = ghIssueList(opts), windowMin = DEFAULT_WINDOW_MIN } = opts;
  const pairs = findRapidDuplicates(issues, windowMin);
  return { ok: pairs.length === 0, pairs, pattern_id: '1765-rapid-duplicate', windowMin };
}

function parseArgs(argv) {
  const args = { mode: null, title: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') { args.mode = 'check'; args.title = argv[++i]; }
    else if (argv[i] === '--scan') { args.mode = 'scan'; }
    else if (argv[i] === '--json') { args.json = true; }
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  let result;
  if (args.mode === 'check') result = checkMode(args.title || '');
  else if (args.mode === 'scan') result = scanMode();
  else { process.stderr.write('usage: ticket-duplicate-guard.js (--check <title> | --scan) [--json]\n'); process.exit(2); }
  if (args.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else {
    if (args.mode === 'check' && !result.ok) process.stdout.write(`✗ duplicate exists: #${result.canonical.number} "${result.canonical.title}"\n`);
    else if (args.mode === 'scan' && !result.ok) for (const p of result.pairs) process.stdout.write(`✗ rapid duplicate #${p.duplicate.number} of #${p.canonical.number} (Δ within ${result.windowMin}m)\n`);
    else process.stdout.write('✓ no duplicates\n');
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = { normalizeTitle, withinWindow, findRapidDuplicates, checkMode, scanMode, parseArgs };
