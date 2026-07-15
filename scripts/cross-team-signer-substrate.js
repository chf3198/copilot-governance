'use strict';
// cross-team-signer-substrate — #1334 AC1. Verifies that the team signing a
// CONSULTANT_EPIC_CLOSEOUT on a cross-team-claimed Epic matches the team that
// holds the active CROSS_TEAM_CLAIM. Resolves both sides to a canonical team
// name via inventory/team-model-signatures.json substrateTeamMap. Pure helper;
// caller supplies pre-fetched comments + labels.

const CLAIM_RE = /CROSS_TEAM_CLAIM:\s*substrate=(\S+?),\s*alias=([^,]+?),\s*expires=(\S+)/;
const CLAIM_RESOLVED_RE = /CROSS_TEAM_CLAIM_(YIELD|EXPIRED|RESOLVED)/;
const TEAM_MODEL_RE = /Team&Model:\s*([^\n]+)/i;
const OVERRIDE_LABEL = 'signer-substrate:waived';

function parseCrossTeamClaim(commentBody, registry) {
  const match = (commentBody || '').match(CLAIM_RE);
  if (!match) return null;
  const substrate = match[1];
  const team = ((registry && registry.substrateTeamMap) || {})[substrate] || null;
  return { substrate, alias: match[2].trim(), expires: match[3], team };
}

function activeClaim(comments, registry) {
  for (let idx = (comments || []).length - 1; idx >= 0; idx--) {
    const body = (comments[idx] && comments[idx].body) || '';
    if (CLAIM_RESOLVED_RE.test(body)) return null;
    const claim = parseCrossTeamClaim(body, registry);
    if (claim) return claim;
  }
  return null;
}

function extractCloseoutTeam(closeoutBody) {
  const match = (closeoutBody || '').match(TEAM_MODEL_RE);
  if (!match) return null;
  const teamPart = match[1].trim().split(':')[0];
  return (teamPart || '').toLowerCase();
}

function findCloseoutBody(comments) {
  for (const comment of (comments || [])) {
    const body = (comment && comment.body) || '';
    if (/CONSULTANT_EPIC_CLOSEOUT/.test(body)) return body;
  }
  return null;
}

function shouldSkip(labels) {
  return (labels || []).includes(OVERRIDE_LABEL) ? 'override-waived' : null;
}

function enforceSubstrateMatch(input) {
  const skipReason = shouldSkip(input.labels);
  if (skipReason) return { ok: true, skipped: skipReason, violations: [] };
  const closeoutTeam = input.closeoutTeam || null;
  const claimTeam = (input.activeClaim && input.activeClaim.team) || null;
  if (!closeoutTeam || !claimTeam) {
    return { ok: true, skipped: 'incomplete-data', violations: [] };
  }
  return closeoutTeam === claimTeam
    ? { ok: true, violations: [] }
    : { ok: false, violations: [{
        rule: 'cross-team-substrate-mismatch',
        detail: `CONSULTANT_EPIC_CLOSEOUT signer team='${closeoutTeam}' but active CROSS_TEAM_CLAIM team='${claimTeam}'`,
      }] };
}

module.exports = {
  parseCrossTeamClaim, activeClaim, extractCloseoutTeam, findCloseoutBody,
  shouldSkip, enforceSubstrateMatch, OVERRIDE_LABEL,
};
