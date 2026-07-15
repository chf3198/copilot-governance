'use strict';
// cross-team-consult-e2e — #1591 (AC4 of #1334). Synthetic state-machine chaining
// AC1–AC3 pure helpers; no live GitHub. Caller supplies registry + timestamps.

const Auto = require('./cross-team-auto-apply.js');
const Reaper = require('./cross-team-claim-reaper.js');
const Sub = require('./cross-team-signer-substrate.js');

const EPIC_LABELS = ['type:epic', 'priority:P2', 'area:governance'];
const DEFAULT_REAPER_NOW_MS = Date.UTC(2026, 4, 17, 0, 0, 0);
const MANAGER_COMMENT = [
  '## MANAGER_HANDOFF', '', 'CONSULTANT_EPIC_CLOSEOUT-pending: evidence anchor.',
  'cross-team Consultant required for SOX baseline.',
  'Signed-by: Orla Mason', 'Team&Model: claude-code:opus-4-7@anthropic', 'Role: manager',
].join('\n');

function initialState() { return { labels: [...EPIC_LABELS], comments: [] }; }
function asComments(state) { return (state.comments || []).map(c => ({ body: c.body || c })); }

function applyManagerRequest(state) {
  const decision = Auto.decideApply({ commentBody: MANAGER_COMMENT, labels: state.labels });
  if (!decision.apply) return { ok: false, reason: decision.reason, state };
  const labels = state.labels.filter(l => !Auto.SUPPRESS_LABELS.includes(l));
  labels.push(decision.label);
  return { ok: true, step: 'manager-auto-apply', label: decision.label,
    state: { labels, comments: [...state.comments, { body: MANAGER_COMMENT }] } };
}

function applyClaim(state, { substrate, alias, expires }) {
  if (!state.labels.includes('consultant:cross-team-needed')) {
    return { ok: false, step: 'claim', reason: 'no-needed-label', state };
  }
  const body = `CROSS_TEAM_CLAIM: substrate=${substrate}, alias=${alias}, expires=${expires}`;
  const labels = state.labels.filter(l => l !== 'consultant:cross-team-needed');
  labels.push('consultant:cross-team-in-progress');
  return { ok: true, step: 'claim', state: { labels, comments: [...state.comments, { body }] } };
}

function applyReaper(state, registry, nowMs) {
  const expired = Reaper.findExpiredClaims([{ issueNumber: 1, comments: asComments(state) }], registry, nowMs);
  if (!expired.length) return { ok: false, step: 'reaper', reason: 'no-expired-claims', state };
  const body = Reaper.buildExpiredComment(expired[0].claim, new Date(nowMs).toISOString());
  const labels = state.labels.filter(l => l !== 'consultant:cross-team-in-progress');
  if (!labels.includes('consultant:cross-team-needed')) labels.push('consultant:cross-team-needed');
  return { ok: true, step: 'reaper-expire', state: { labels, comments: [...state.comments, { body }] } };
}

function canReclaim(state, registry) {
  return state.labels.includes('consultant:cross-team-needed')
    && !Sub.activeClaim(asComments(state), registry || {});
}

function verifyCloseout(state, closeoutBody, registry) {
  const comments = asComments(state);
  comments.push({ body: closeoutBody });
  return Sub.enforceSubstrateMatch({
    closeoutTeam: Sub.extractCloseoutTeam(closeoutBody),
    activeClaim: Sub.activeClaim(comments, registry), labels: state.labels,
  });
}

function runSyntheticFlow(registry, opts = {}) {
  const substrate = opts.substrate || 'codex-cli';
  const alias = opts.alias || 'Quill Vale';
  const claimExpires = opts.claimExpires || '2026-05-16T00:00:00Z';
  const reaperNowMs = opts.reaperNowMs || DEFAULT_REAPER_NOW_MS;
  const trace = [];
  let state = initialState();
  for (const step of [
    () => applyManagerRequest(state),
    () => applyClaim(state, { substrate, alias, expires: claimExpires }),
    () => applyReaper(state, registry, reaperNowMs),
  ]) {
    const result = step();
    trace.push(result);
    if (!result.ok) return { ok: false, trace };
    state = result.state;
  }
  if (!canReclaim(state, registry)) return { ok: false, trace, reason: 'reclaim-unavailable' };
  const reclaim = applyClaim(state, { substrate, alias, expires: opts.reclaimExpires || '2026-05-20T00:00:00Z' });
  trace.push(reclaim);
  if (!reclaim.ok) return { ok: false, trace };
  state = reclaim.state;
  const match = verifyCloseout(state, 'CONSULTANT_EPIC_CLOSEOUT\nTeam&Model: codex:gpt-5@codex-cli\nRole: consultant', registry);
  const mismatch = verifyCloseout(state, 'CONSULTANT_EPIC_CLOSEOUT\nTeam&Model: claude-code:opus@anthropic\nRole: consultant', registry);
  return { ok: match.ok && !mismatch.ok, trace, state, signerGate: { match, mismatch }, reclaimAvailable: true };
}

module.exports = {
  EPIC_LABELS, MANAGER_COMMENT, initialState, applyManagerRequest, applyClaim,
  applyReaper, canReclaim, verifyCloseout, runSyntheticFlow,
};
