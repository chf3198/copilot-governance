#!/usr/bin/env node
'use strict';
// Issue-transition: atomic label flip from <from-status> to <to-status>
// per repo baton conventions. Refs #1994 — routes label-read/write through
// github-dispatcher.js (MCP-first with gh-CLI fallback).
const { execute } = require('./github-dispatcher');
const { verifyEpicEvidence } = require('./epic-evidence');

const TRANSITIONS = {
  backlog: ['ready', 'in-progress'],
  triage: ['ready'],
  ready: ['in-progress'],
  'in-progress': ['testing'],
  testing: ['review'],
  review: ['done'],
};
const ROLE_FOR = {
  'in-progress': 'collaborator',
  testing: 'admin',
  review: 'consultant',
};

function parseArgs(argv) {
  const [issue, fromStatus, toStatus, ...extras] = argv;
  return {
    issue, fromStatus, toStatus,
    force: extras.includes('--force'),
    dryRun: extras.includes('--dry-run'),
  };
}

function validateTransition({ issue, fromStatus, toStatus, force }) {
  if (!issue || !fromStatus || !toStatus) {
    throw new Error('Usage: issue-transition.js <issue#> <from-status> <to-status> [--force] [--dry-run]');
  }
  const allowed = TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus) && !force) {
    throw new Error(`Invalid transition: ${fromStatus} → ${toStatus}\nAllowed from ${fromStatus}: ${allowed.join(', ') || 'none'}`);
  }
}

async function readIssue(issue, opts) {
  const r = await execute('get-issue', { issue, json: 'labels,title' }, opts);
  if (!r.ok) throw new Error(`get-issue failed: ${r.error || r.reason}`);
  const stdout = r.stdout || (r.result ? JSON.stringify(r.result) : '');
  return JSON.parse(stdout);
}

function nextLabels(labels, toStatus) {
  const kept = labels.filter(l => !l.startsWith('status:') && !l.startsWith('role:'));
  kept.push(`status:${toStatus}`);
  if (ROLE_FOR[toStatus]) kept.push(`role:${ROLE_FOR[toStatus]}`);
  return kept;
}

async function writeLabels(issue, labels, opts) {
  const r = await execute('set-labels', { issue, labels }, opts);
  if (!r.ok) throw new Error(`set-labels failed via ${r.provider}: ${r.error || r.reason}`);
  return r;
}

async function transition(argv = process.argv.slice(2), opts = {}) {
  const args = parseArgs(argv);
  validateTransition(args);
  const data = await readIssue(args.issue, opts);
  const labels = (data.labels || []).map(l => (typeof l === 'string' ? l : l.name));
  const current = labels.filter(l => l.startsWith('status:')).map(l => l.slice(7));
  if (!args.force && !current.includes(args.fromStatus)) {
    throw new Error(`Issue #${args.issue} not at status:${args.fromStatus} (currently: ${current.join(',') || 'none'})`);
  }
  if (args.toStatus === 'done' && labels.includes('type:epic')) {
    const report = verifyEpicEvidence(args.issue);
    report.warnings.forEach(w => console.warn(`Warning: ${w}`));
    if (report.errors.length && !args.force) {
      report.errors.forEach(e => console.error(e));
      throw new Error('Use --force only for explicit emergency override.');
    }
  }
  const next = nextLabels(labels, args.toStatus);
  if (args.dryRun) {
    console.log(JSON.stringify({ issue: Number(args.issue), labels: next }, null, 2));
    return { dryRun: true, labels: next };
  }
  await writeLabels(args.issue, next, opts);
  if (args.toStatus === 'in-progress') {
    try {
      const { classifyPrompt } = require('./task-router');
      const route = classifyPrompt(data.title || '');
      console.log(`task-route: lane=${route.lane} model=${route.recommendedModel} (confidence: ${route.confidence})`);
    } catch { /* task-router optional */ }
  }
  console.log(`#${args.issue}: ${args.fromStatus}(${ROLE_FOR[args.fromStatus] || '-'}) → ${args.toStatus}(${ROLE_FOR[args.toStatus] || '-'})`);
  return { ok: true, labels: next };
}

if (require.main === module) {
  transition().catch((error) => { console.error(error.message); process.exit(1); });
}

module.exports = { transition, parseArgs, validateTransition, nextLabels, readIssue, writeLabels };
