#!/usr/bin/env node
'use strict';
// second-opinion-replay-eval (#1612 AC1+AC4) — replays closed PRs that had a
// CONSULTANT_CLOSEOUT to measure: present-rate (how many already include a
// SECOND_OPINION block), delta distribution, would-escalate rate. Drives
// decision: promote to required vs keep advisory + auto-file Tier-3.

const { execFileSync } = require('node:child_process');
const SO = require('./consultant-second-opinion.js');

const PRESENT_RATE_THRESHOLD = 0.50;
const MIN_SAMPLE = 20;
const DEFAULT_LIMIT = 50;

function gh(args) {
  try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (err) { return err.stdout?.toString('utf8') || ''; }
}

function listMergedPRs(limit) {
  const raw = gh(['pr', 'list', '--state', 'merged', '--limit', String(limit),
    '--json', 'number,body,labels']);
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
  if (SO.shouldSkip(labels)) return { pr: pr.number, skipped: 'waiver-label' };
  const closeout = (comments || []).map(c => c.body || '').find(b => b.includes('CONSULTANT_CLOSEOUT'));
  if (!closeout) return { pr: pr.number, skipped: 'no-closeout' };
  const hasSecondOpinion = /SECOND_OPINION/.test(closeout);
  let maxAbsDelta = 0, wouldEscalate = false;
  if (hasSecondOpinion) {
    const m1 = closeout.match(/max_abs_delta\s*:\s*([\d.]+)/);
    maxAbsDelta = m1 ? Number(m1[1]) : 0;
    wouldEscalate = SO.shouldEscalateTier3(maxAbsDelta);
  }
  return { pr: pr.number, linked, has_second_opinion: hasSecondOpinion,
    max_abs_delta: maxAbsDelta, would_escalate: wouldEscalate };
}

function aggregate(results) {
  const evaluated = results.filter(r => !r.skipped);
  const withSO = evaluated.filter(r => r.has_second_opinion);
  const wouldEscalate = evaluated.filter(r => r.would_escalate);
  const presentRate = evaluated.length > 0 ? withSO.length / evaluated.length : 0;
  const skippedByReason = {};
  for (const skipResult of results.filter(item => item.skipped)) {
    skippedByReason[skipResult.skipped] = (skippedByReason[skipResult.skipped] || 0) + 1;
  }
  const promote = evaluated.length >= MIN_SAMPLE && presentRate >= PRESENT_RATE_THRESHOLD;
  return {
    total: results.length,
    evaluated: evaluated.length,
    skipped_by_reason: skippedByReason,
    with_second_opinion: withSO.length,
    present_rate: presentRate,
    would_escalate_tier3: wouldEscalate.length,
    decision: promote ? 'PROMOTE_TO_REQUIRED' : 'STAY_ADVISORY_AUTO_FILE_TIER3',
    decision_reason: evaluated.length < MIN_SAMPLE
      ? `insufficient-sample (${evaluated.length} < ${MIN_SAMPLE})`
      : (presentRate < PRESENT_RATE_THRESHOLD
        ? `adoption-too-low (${(presentRate*100).toFixed(1)}% < ${(PRESENT_RATE_THRESHOLD*100).toFixed(0)}%) — auto-file Tier-3 path more pragmatic`
        : 'criteria-met'),
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
    process.stdout.write(`\nsecond-opinion replay-eval (#1612)\n`);
    process.stdout.write(`  evaluated: ${result.evaluated} / ${result.total}\n`);
    process.stdout.write(`  with_second_opinion: ${result.with_second_opinion} (${(result.present_rate*100).toFixed(1)}%)\n`);
    process.stdout.write(`  would_escalate_tier3: ${result.would_escalate_tier3}\n`);
    process.stdout.write(`  decision: ${result.decision}  (${result.decision_reason})\n`);
  }
  process.exit(0);
}

module.exports = { run, replayPR, aggregate, listMergedPRs,
  PRESENT_RATE_THRESHOLD, MIN_SAMPLE, DEFAULT_LIMIT };
