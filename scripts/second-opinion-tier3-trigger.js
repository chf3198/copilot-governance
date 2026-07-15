#!/usr/bin/env node
'use strict';
// second-opinion-tier3-trigger (#1612 AC4) — when a second-opinion run
// produces max_abs_delta > ESCALATE_THRESHOLD, file a Tier-3 anneal ticket
// per Epic #1308 contract. Composes with consultant-second-opinion.js
// (the threshold + escalate decision) and the broader Tier-3 protocol.

const { execFileSync } = require('node:child_process');
const SO = require('./consultant-second-opinion.js');

const TIER3_LABELS = ['type:bug', 'priority:P2', 'area:governance',
  'lane:code-change', 'anneal:tier-3'];

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function buildTier3Body(input) {
  const { sourceTicket, deltas, max_abs_delta, raterTeamModel, firstScores, secondScores } = input;
  const deltaLines = Object.keys(deltas || {}).sort()
    .map(g => `  - ${g}: first=${firstScores[g]} second=${secondScores[g]} delta=${deltas[g]}`).join('\n');
  return [
    '## Tier-3 anneal: cross-family rater disagreement',
    '',
    `Triggered automatically by second-opinion-tier3-trigger.js when max_abs_delta = ${max_abs_delta} > ${SO.ESCALATE_THRESHOLD}.`,
    '',
    `Source: #${sourceTicket} consultant-closeout`,
    `First rater: see source ticket CONSULTANT_CLOSEOUT artifact`,
    `Second rater: ${raterTeamModel}`,
    '',
    'Per-goal deltas:',
    deltaLines,
    '',
    'Per Epic #1308 Tier-3 contract: investigate disagreement, classify root cause',
    '(actor-critic same-model amplification vs. genuine rubric disagreement vs.',
    'rater error), file remediation per goal-failure-emission protocol.',
    '',
    `Refs Epic #1612`,
    `anneal_tickets_filed: none`,
  ].join('\n');
}

function fileTier3Ticket(input) {
  const title = `Tier-3 anneal: cross-family rater disagreement on #${input.sourceTicket} (delta=${input.max_abs_delta})`;
  const body = buildTier3Body(input);
  if (input.dryRun) return { ok: true, dry_run: true, title, body };
  const args = ['issue', 'create', '--title', title, '--body', body];
  for (const label of TIER3_LABELS) args.push('--label', label);
  const url = gh(args).trim();
  const numMatch = url.match(/\/issues\/(\d+)/);
  return { ok: true, url, ticket: numMatch ? parseInt(numMatch[1], 10) : null,
    title, body };
}

function triggerIfNeeded(input) {
  if (!SO.shouldEscalateTier3(input.max_abs_delta)) {
    return { ok: true, triggered: false, reason: 'delta-below-threshold' };
  }
  return { triggered: true, ...fileTier3Ticket(input) };
}

if (require.main === module) {
  const fs = require('node:fs');
  const file = process.argv[2];
  if (!file) { console.error('usage: second-opinion-tier3-trigger.js <runner-output.json>'); process.exit(1); }
  const runnerOutput = JSON.parse(fs.readFileSync(file, 'utf8'));
  const sourceTicket = process.env.SOURCE_TICKET || process.argv[3];
  if (!sourceTicket) { console.error('SOURCE_TICKET env or argv[3] required'); process.exit(1); }
  const result = triggerIfNeeded({ sourceTicket: Number(sourceTicket),
    deltas: runnerOutput.deltas, max_abs_delta: runnerOutput.max_abs_delta,
    raterTeamModel: runnerOutput.rater_team_model,
    firstScores: runnerOutput.first_scores, secondScores: runnerOutput.second_scores,
    dryRun: process.argv.includes('--dry-run') });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

module.exports = { triggerIfNeeded, fileTier3Ticket, buildTier3Body, TIER3_LABELS };
