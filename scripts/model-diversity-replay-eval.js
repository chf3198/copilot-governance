#!/usr/bin/env node
'use strict';
// model-diversity-replay-eval (#1612 AC1+AC2 + composes #1771) — replays
// closed PRs against enforceCriticalPathDiversity to measure precision /
// FP rate. Replaces calendar-bound soak with hours-bound replay validation.
// Promotion criterion: FP-rate <= 10% on N>=30 evaluated PRs => required.

const { execFileSync } = require('node:child_process');
const { enforceCriticalPathDiversity, extractFromComments } = require('./baton-team-model.js');

const FP_THRESHOLD = 0.10;
const MIN_SAMPLE = 30;
const DEFAULT_LIMIT = 50;

function gh(args) {
  try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (err) { return err.stdout?.toString('utf8') || ''; }
}

function listMergedPRs(limit) {
  const raw = gh(['pr', 'list', '--state', 'merged', '--limit', String(limit),
    '--json', 'number,title,body,labels,mergedAt']);
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

function fetchComments(issueNumber) {
  const raw = gh(['issue', 'view', String(issueNumber), '--json', 'comments,labels']);
  try { const j = JSON.parse(raw); return { comments: j.comments || [], labels: (j.labels || []).map(l => l.name) }; }
  catch { return { comments: [], labels: [] }; }
}

function replayPR(pr) {
  const m = (pr.body || '').match(/Refs\s+#(\d+)/i);
  if (!m) return { pr: pr.number, skipped: 'no-refs' };
  const linked = parseInt(m[1], 10);
  const { comments, labels } = fetchComments(linked);
  if (comments.length === 0) return { pr: pr.number, skipped: 'no-comments' };
  const roles = extractFromComments(comments);
  if (!roles.collaborator && !roles.admin && !roles.consultant) {
    return { pr: pr.number, skipped: 'no-roles' };
  }
  const result = enforceCriticalPathDiversity({ ...roles, labels });
  return { pr: pr.number, linked, ok: result.ok, violations: result.violations || [],
    skipped: result.skipped, roles };
}

function aggregate(results) {
  const evaluated = results.filter(r => !r.skipped);
  const violations = evaluated.filter(r => !r.ok);
  const skippedByReason = {};
  for (const skipResult of results.filter(item => item.skipped)) {
    skippedByReason[skipResult.skipped] = (skippedByReason[skipResult.skipped] || 0) + 1;
  }
  const fpRate = evaluated.length > 0 ? violations.length / evaluated.length : 0;
  const promote = evaluated.length >= MIN_SAMPLE && fpRate <= FP_THRESHOLD;
  return {
    total: results.length,
    evaluated: evaluated.length,
    skipped_by_reason: skippedByReason,
    violations: violations.length,
    fp_rate: fpRate,
    fp_threshold: FP_THRESHOLD,
    min_sample: MIN_SAMPLE,
    decision: promote ? 'PROMOTE_TO_REQUIRED' : 'STAY_ADVISORY',
    decision_reason: evaluated.length < MIN_SAMPLE
      ? `insufficient-sample (${evaluated.length} < ${MIN_SAMPLE})`
      : (fpRate > FP_THRESHOLD ? `fp-rate-too-high (${(fpRate*100).toFixed(1)}% > ${(FP_THRESHOLD*100).toFixed(0)}%)` : 'criteria-met'),
  };
}

function run(opts = {}) {
  const prs = opts.prs || listMergedPRs(opts.limit || DEFAULT_LIMIT);
  const results = prs.map(replayPR);
  return { ...aggregate(results), results };
}

if (require.main === module) {
  const result = run({ limit: parseInt(process.argv[2], 10) || DEFAULT_LIMIT });
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else {
    process.stdout.write(`\nmodel-diversity replay-eval (#1612)\n`);
    process.stdout.write(`  evaluated: ${result.evaluated} / ${result.total}\n`);
    process.stdout.write(`  violations: ${result.violations}\n`);
    process.stdout.write(`  fp_rate: ${(result.fp_rate*100).toFixed(1)}%  (threshold ${(result.fp_threshold*100).toFixed(0)}%)\n`);
    process.stdout.write(`  decision: ${result.decision}  (${result.decision_reason})\n`);
  }
  process.exit(0);
}

module.exports = { run, replayPR, aggregate, listMergedPRs,
  FP_THRESHOLD, MIN_SAMPLE, DEFAULT_LIMIT };
