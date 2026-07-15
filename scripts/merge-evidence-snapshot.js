#!/usr/bin/env node
'use strict';
// Epic #1486 Phase-1d. Local snapshot writer for the merge-evidence dashboard
// panel. Queries gh CLI for recently-closed status:done issues, runs them
// through the reconciler, aggregates per team, writes
// ~/.megingjord/merge-evidence-snapshot.json. Operator runs via
// `npm run merge-evidence:snapshot`. Pure aggregation is unit-testable.

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const reconciler = require('./merge-evidence-reconciler.js');

const SNAPSHOT_PATH = path.join(os.homedir(), '.megingjord', 'merge-evidence-snapshot.json');
const DEFAULT_WINDOW_DAYS = 7;
const TEAM_RE = /Team&Model:\s*([a-z-]+):/i;

function extractTeam(text) {
  const match = TEAM_RE.exec(text || '');
  return match ? match[1] : 'unknown';
}

function aggregateByTeam(plan) {
  const totals = {};
  for (const violation of plan.violations) {
    const team = violation.team || 'unknown';
    totals[team] = (totals[team] || 0) + 1;
  }
  return totals;
}

function buildSnapshot(plan, windowDays = DEFAULT_WINDOW_DAYS) {
  return {
    generated_at: new Date().toISOString(),
    window_days: windowDays,
    processed: plan.processed,
    remaining: plan.remaining,
    counts: {
      violations: plan.violations.length,
      skipped: plan.skipped.length,
      passed: plan.passed.length,
    },
    by_team: aggregateByTeam(plan),
    violations: plan.violations.map((v) => ({
      number: v.number, title: v.title, team: v.team || 'unknown',
    })),
  };
}

function fetchClosedIssues(windowDays, gh = (cmd) => cp.execSync(cmd, { encoding: 'utf8' })) {
  const since = new Date(Date.now() - windowDays * 86400e3).toISOString().slice(0, 10);
  const raw = gh(`gh issue list --state closed --label status:done --search "closed:>=${since}" --limit 50 --json number,title,labels,state,body`);
  return JSON.parse(raw || '[]');
}

function fetchMergedPRs(issueNumber, gh = (cmd) => cp.execSync(cmd, { encoding: 'utf8' })) {
  try {
    const raw = gh(`gh pr list --state merged --search "#${issueNumber} in:body" --json number --limit 5`);
    return JSON.parse(raw || '[]');
  } catch { return []; }
}

function main(opts = {}) {
  const windowDays = opts.windowDays || DEFAULT_WINDOW_DAYS;
  const issues = fetchClosedIssues(windowDays);
  const items = issues.map((issue) => ({
    issue, mergedPRRefs: fetchMergedPRs(issue.number),
  }));
  const plan = reconciler.reconcile(items, { batchSize: items.length });
  for (const violation of plan.violations) {
    const issue = issues.find((entry) => entry.number === violation.number);
    violation.team = extractTeam(issue?.body || '');
  }
  const snapshot = buildSnapshot(plan, windowDays);
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
  return snapshot;
}

if (require.main === module) {
  const snapshot = main();
  console.log(`Wrote ${SNAPSHOT_PATH}`);
  console.log(`violations=${snapshot.counts.violations} skipped=${snapshot.counts.skipped} passed=${snapshot.counts.passed}`);
}

module.exports = {
  main, buildSnapshot, aggregateByTeam, extractTeam,
  SNAPSHOT_PATH, DEFAULT_WINDOW_DAYS, TEAM_RE,
};
