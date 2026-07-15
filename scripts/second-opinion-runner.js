#!/usr/bin/env node
'use strict';
// tier: 3
// second-opinion-runner (#1612 AC4) — runs a cross-family fleet rater
// (qwen2.5-coder via HAMR-wrapped Ollama) against a CONSULTANT_CLOSEOUT
// rubric and produces a SECOND_OPINION block. Closes the 0%-adoption gap
// of the #1573 helper (the helper parses; nothing was invoking the rater).

const { fleetCall } = require('./fleet-via-hamr.js');
const SO = require('./consultant-second-opinion.js');

const DEFAULT_TIER = 'fleet-large';
const RATER_TEAM_MODEL = 'fleet:qwen2.5-coder@36gbwinresource';
const CLOSEOUT_CAP_CHARS = 4000;
const DIFF_CAP_CHARS = 2000;
const FLEET_TIMEOUT_MS = 90000;
const RAW_RESPONSE_CAP_CHARS = 500;
const SCORE_LINE_STRIP = /\b(?:G[1-9]|GA)\s*[=:]\s*\d+(?:\.\d+)?\s*/gi;
const PROMPT_TEMPLATE = `You are an INDEPENDENT cross-family code-review rater. Rate the work on each of the 9 governance goals PLUS the operator-autonomy dimension (GA) on a 1-10 integer scale. Do NOT defer to or copy any scores you see in the closeout — produce your own honest assessment based on the deliverable. Output ONLY the 10 lines, one per goal, exact format:
G1=N
G2=N
G3=N
G4=N
G5=N
G6=N
G7=N
G8=N
G9=N
GA=N

Goals: G1 Governance, G2 Quality, G3 Zero-Cost, G4 Privacy & Security, G5 Portability, G6 Resilience, G7 Throughput, G8 Observability, G9 Interoperability. GA Operator-Autonomy (cross-cutting principle): did this work unnecessarily pull in the human? 10 = fully autonomous within the 4 retained carve-outs (design/UAT/irreversible/security-weakening); 1 = a routine reversible decision was needlessly escalated to the client.

CONSULTANT_NARRATIVE (scores stripped):
{{CLOSEOUT}}

PR_DIFF_SUMMARY:
{{DIFF}}`;

function stripScores(text) {
  return String(text || '').replace(SCORE_LINE_STRIP, '');
}

function buildPrompt(closeoutBody, diffSummary) {
  return PROMPT_TEMPLATE
    .replace('{{CLOSEOUT}}', stripScores(closeoutBody).slice(0, CLOSEOUT_CAP_CHARS))
    .replace('{{DIFF}}', String(diffSummary || '').slice(0, DIFF_CAP_CHARS));
}

function parseScoreLines(text) {
  const out = {};
  for (const m of String(text || '').matchAll(/\b(G[1-9]|GA)\s*[=:]\s*(\d+(?:\.\d+)?)/gi)) {
    const goal = m[1].toUpperCase();
    const score = Number(m[2]);
    if (Number.isFinite(score) && !(goal in out)) out[goal] = score;
  }
  return out;
}

async function runSecondOpinion(input) {
  const { closeoutBody, diffSummary, tier, model, dryRun } = input;
  const firstScores = SO.parseCloseoutScores(closeoutBody);
  if (dryRun) {
    return { ok: true, dry_run: true, first_scores: firstScores,
      rater_team_model: RATER_TEAM_MODEL };
  }
  const prompt = buildPrompt(closeoutBody, diffSummary);
  const resp = await fleetCall({ prompt, tier: tier || DEFAULT_TIER, model },
    { timeoutMs: FLEET_TIMEOUT_MS });
  const responseText = resp?.value?.data?.response || '';
  const secondScores = parseScoreLines(responseText);
  const { deltas, max_abs_delta } = SO.computeDeltas(firstScores, secondScores);
  const escalate = SO.shouldEscalateTier3(max_abs_delta);
  const block = SO.appendSecondOpinionBlock({ second_scores: secondScores,
    deltas, max_abs_delta, escalate, rater_team_model: RATER_TEAM_MODEL });
  return { ok: true, first_scores: firstScores, second_scores: secondScores,
    deltas, max_abs_delta, escalate, block, rater_team_model: RATER_TEAM_MODEL,
    raw_response: responseText.slice(0, RAW_RESPONSE_CAP_CHARS) };
}

if (require.main === module) {
  const fs = require('node:fs');
  const closeoutPath = process.argv[2];
  if (!closeoutPath) { console.error('usage: second-opinion-runner.js <closeout-file> [diff-file]'); process.exit(1); }
  const closeoutBody = fs.readFileSync(closeoutPath, 'utf8');
  const diffSummary = process.argv[3] ? fs.readFileSync(process.argv[3], 'utf8') : '';
  runSecondOpinion({ closeoutBody, diffSummary, dryRun: process.argv.includes('--dry-run') })
    .then(r => { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); })
    .catch(err => { console.error(err.message); process.exit(2); });
}

module.exports = { runSecondOpinion, parseScoreLines, buildPrompt,
  RATER_TEAM_MODEL, DEFAULT_TIER };
