'use strict';
// cross-team-claim-reaper — #1589 (AC2 follow-on of #1334). Pure decision
// helper for the daily cron that scans Epics labeled
// consultant:cross-team-in-progress, finds expired CROSS_TEAM_CLAIM comments
// per the 24h TTL convention from cross-team-queue.js, and emits action
// descriptors. The workflow YAML handles the actual GitHub API calls.

const signerSubstrate = require('./cross-team-signer-substrate.js');

function isClaimExpired(claim, nowMs) {
  if (!claim || !claim.expires) return null;
  const expiresMs = Date.parse(claim.expires);
  if (!Number.isFinite(expiresMs)) return null;
  return Number(nowMs) > expiresMs;
}

function findExpiredClaims(epics, registry, nowMs) {
  const expired = [];
  for (const epic of epics || []) {
    if (!epic) continue;
    const claim = signerSubstrate.activeClaim(epic.comments || [], registry);
    if (!claim) continue;
    if (isClaimExpired(claim, nowMs) === true) {
      expired.push({
        issueNumber: epic.issueNumber,
        claim,
        reason: `expires-past-now (expires=${claim.expires})`,
      });
    }
  }
  return expired;
}

function buildExpiredComment(claim, nowIso) {
  return [
    `CROSS_TEAM_CLAIM_EXPIRED: expired-at=${nowIso}; ` +
      `original-substrate=${claim.substrate || 'unknown'}; ` +
      `original-alias=${claim.alias || 'unknown'}; ` +
      `original-expires=${claim.expires || 'unknown'}`,
    '',
    'Label reverted from `consultant:cross-team-in-progress` to ' +
      '`consultant:cross-team-needed` per #1589 (AC2 of #1334).',
  ].join('\n');
}

module.exports = { isClaimExpired, findExpiredClaims, buildExpiredComment };
