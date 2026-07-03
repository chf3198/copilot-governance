'use strict';
// consultant-second-opinion — Epic #1568 AC-4 (#1573). Pure helper that parses
// a CONSULTANT_CLOSEOUT body, compares its per-goal scores against a second
// rater's scores, and decides whether a Tier-3 escalation should fire. Caller
// supplies the second rater's output; helper does no LLM calls itself (pure +
// testable). Defeats single-rater self-bias amplification per Mozilla.AI
// Star Chamber finding F5 from #1569 research.

const ESCALATE_THRESHOLD = 1.0;
const SCORE_LINE_RE = /\b(G[1-9])\s*[=:]\s*(\d+(?:\.\d+)?)/gi;
const RATER_RE = /Team&Model:\s*([^\n]+)/i;
const OVERRIDE_LABEL = 'second-opinion:waived';

function parseCloseoutScores(body) {
  const out = {};
  const text = body || '';
  for (const match of text.matchAll(SCORE_LINE_RE)) {
    const goal = match[1].toUpperCase();
    const score = Number(match[2]);
    if (Number.isFinite(score) && !(goal in out)) out[goal] = score;
  }
  return out;
}

function parseRaterTeamModel(body) {
  const match = (body || '').match(RATER_RE);
  return match ? match[1].trim() : null;
}

function providerOf(teamModel) {
  if (!teamModel) return null;
  return String(teamModel).split(':')[0].toLowerCase();
}

function isCrossProviderRater(firstRater, secondRater) {
  const a = providerOf(firstRater);
  const b = providerOf(secondRater);
  if (!a || !b) return false;
  return a !== b;
}

function computeDeltas(firstScores, secondScores) {
  const deltas = {};
  let maxAbs = 0;
  const goals = new Set([...Object.keys(firstScores || {}), ...Object.keys(secondScores || {})]);
  for (const goal of goals) {
    const a = (firstScores || {})[goal];
    const b = (secondScores || {})[goal];
    if (a == null || b == null) continue;
    const delta = b - a;
    if (Number.isFinite(delta)) {
      deltas[goal] = delta;
      if (Math.abs(delta) > maxAbs) maxAbs = Math.abs(delta);
    }
  }
  return { deltas, max_abs_delta: maxAbs };
}

function shouldEscalateTier3(maxAbsDelta) {
  return Number.isFinite(maxAbsDelta) && maxAbsDelta > ESCALATE_THRESHOLD;
}

function appendSecondOpinionBlock(input) {
  const scores = input.second_scores || {};
  const deltas = input.deltas || {};
  const scoreLine = Object.keys(scores).sort().map(g => `${g}=${scores[g]}`).join(',');
  const deltaLine = Object.keys(deltas).sort().map(g => `${g}=${deltas[g]}`).join(',');
  const verdict = input.escalate ? 'ESCALATE_TIER_3' : 'NO_ESCALATION';
  return [
    'SECOND_OPINION',
    `rater_team_model: ${input.rater_team_model || 'unknown'}`,
    `scores: ${scoreLine}`,
    `deltas: ${deltaLine}`,
    `max_abs_delta: ${input.max_abs_delta || 0}`,
    `verdict: ${verdict}`,
  ].join('\n');
}

function shouldSkip(labels) {
  return (labels || []).includes(OVERRIDE_LABEL) ? 'override-waived' : null;
}

module.exports = {
  parseCloseoutScores, parseRaterTeamModel, providerOf, isCrossProviderRater,
  computeDeltas, shouldEscalateTier3, appendSecondOpinionBlock,
  shouldSkip, ESCALATE_THRESHOLD, OVERRIDE_LABEL,
};
