#!/usr/bin/env node
'use strict';
// exempt-review-sweep (#3526, Epic #3517 T-F3 / ADR-020 §D2) — surfaces exempt-but-idle epics
// that sit in the stale.yml exemption blind zone (type:epic / milestoned; never reviewed).
// Surface-only invariant I0: NEVER closes. Reuses the #2920 dormant scaffold and DEFERS to it
// for status:dormant epics. Ships SHADOW/report-only first (logs would-be targets, applies no
// label) so the cold-start guard is validated before enforcement. Kill-switch: EXEMPT_SWEEP_DISABLED.

const { thresholdFromSamples } = require('./median-cycle-time');

const SIGNAL_LABEL = 'signal:exempt-review';
const CLOSE_ELIGIBLE_LABEL = 'signal:close-eligible';
const DORMANT_LABEL = 'status:dormant';
const APPLY_COMMENT = 'EXEMPT_REVIEW';
const CLEARED_COMMENT = 'EXEMPT_REVIEW_CLEARED';
const SHADOW_INCIDENT = 'exempt-review-shadow-would-apply';
const APPEALS_QUEUE = '#2990';

// Pure decision core. facts:
//   idleDays        number  — days since last child state-change or comment
//   thresholdDays   number  — velocity-relative idle threshold (from median-cycle-time)
//   dormant         bool    — status:dormant present (→ defer to #2920)
//   closeEligible   bool    — signal:close-eligible present (→ D1 already surfaced)
//   labelPresent    bool    — signal:exempt-review already applied
//   shadow          bool    — report-only staged-rollout mode
// Returns { action, ... }. action ∈ {no-op, skip, clear, shadow-log, apply, debounce}. NEVER closes.
function decideExemptReview(facts = {}) {
  const { idleDays, thresholdDays, dormant, closeEligible, labelPresent, shadow } = facts;
  // Edge (a)/(b): an epic that is (or became) dormant is #2920's job — clear our label if present.
  if (dormant) {
    return labelPresent
      ? { action: 'clear', label: SIGNAL_LABEL, comment: CLEARED_COMMENT, reason: 'became dormant — defer to #2920' }
      : { action: 'skip', reason: 'status:dormant — #2920 owns review' };
  }
  // Edge (c): D1 already surfaced this epic for close — don't double-notify.
  if (closeEligible) return { action: 'skip', reason: 'signal:close-eligible present — D1 already surfaced' };
  // Fail-safe: an unusable threshold must not trip a review (never surface on bad input).
  if (typeof idleDays !== 'number' || typeof thresholdDays !== 'number' || !(thresholdDays > 0)) {
    return { action: 'no-op', reason: 'idle/threshold unavailable — do not surface' };
  }
  const idle = idleDays > thresholdDays;
  if (!idle) return { action: 'no-op', reason: `active within threshold (${idleDays}d ≤ ${thresholdDays}d)` };
  if (labelPresent) return { action: 'debounce', reason: 'already surfaced for exempt review' };
  if (shadow) return { action: 'shadow-log', incident: SHADOW_INCIDENT, reason: 'idle beyond threshold (shadow mode — no label)' };
  return { action: 'apply', label: SIGNAL_LABEL, comment: APPLY_COMMENT, queue: APPEALS_QUEUE,
    reason: `idle ${idleDays}d > ${thresholdDays}d — surface for owner review (never closes)` };
}

module.exports = {
  decideExemptReview, thresholdFromSamples, run,
  SIGNAL_LABEL, CLOSE_ELIGIBLE_LABEL, DORMANT_LABEL, APPLY_COMMENT, CLEARED_COMMENT, SHADOW_INCIDENT,
};

// --- Thin runner (integration; the pure cores above are the tested surface). ---
const MS_PER_DAY = 86400000;

function labelNames(issue) {
  return (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name));
}

// Idle days = days since the most recent of {updated_at, last comment}. Conservative: any recent
// activity keeps the epic active.
function idleDaysFrom(issue, nowMs) {
  const updated = Date.parse(issue.updated_at);
  return Number.isFinite(updated) ? (nowMs - updated) / MS_PER_DAY : 0;
}

async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  if (process.env.EXEMPT_SWEEP_DISABLED === '1') { core.info('exempt-sweep disabled (kill-switch)'); return; }
  const shadow = process.env.EXEMPT_SWEEP_SHADOW !== '0'; // default SHADOW until explicitly enabled
  const nowMs = Date.parse(context.payload?.repository?.pushed_at) || Date.parse(new Date().toISOString());
  const samples = await closedChildSamples(github, owner, repo);
  const thresholdDays = thresholdFromSamples(samples);
  const epics = await github.paginate(github.rest.issues.listForRepo,
    { owner, repo, labels: 'type:epic', state: 'open', per_page: 100 });
  for (const epic of epics) {
    const names = labelNames(epic);
    const decision = decideExemptReview({
      idleDays: idleDaysFrom(epic, nowMs), thresholdDays,
      dormant: names.includes(DORMANT_LABEL), closeEligible: names.includes(CLOSE_ELIGIBLE_LABEL),
      labelPresent: names.includes(SIGNAL_LABEL), shadow,
    });
    core.info(`epic #${epic.number}: ${decision.action} — ${decision.reason}`);
    if (decision.action === 'apply') {
      await github.rest.issues.addLabels({ owner, repo, issue_number: epic.number, labels: [SIGNAL_LABEL] });
      await github.rest.issues.createComment({ owner, repo, issue_number: epic.number,
        body: `${APPLY_COMMENT}: epic #${epic.number} exempt-but-idle > threshold → @manager review (${APPEALS_QUEUE}). Surface-only; does not close.` });
    } else if (decision.action === 'clear') {
      await github.rest.issues.removeLabel({ owner, repo, issue_number: epic.number, name: SIGNAL_LABEL }).catch(() => {}); // catch-empty: already gone
    }
  }
}

// Trailing N=20 closed children with a status:in-progress event → cycle-time samples.
async function closedChildSamples(github, owner, repo, limit = 20) {
  const closed = await github.paginate(github.rest.issues.listForRepo,
    { owner, repo, state: 'closed', labels: 'type:task', sort: 'updated', per_page: 100 });
  const samples = [];
  for (const issue of closed.slice(0, limit)) {
    try {
      const events = await github.paginate(github.rest.issues.listEvents,
        { owner, repo, issue_number: issue.number, per_page: 100 });
      const started = events.find(e => e.event === 'labeled' && e.label?.name === 'status:in-progress');
      if (started && issue.closed_at) samples.push({ inProgressAt: started.created_at, closedAt: issue.closed_at });
    } catch { /* catch-empty: skip a child whose events can't be read (degraded → fewer samples → floor) */ }
  }
  return samples;
}
