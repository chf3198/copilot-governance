'use strict';
// consultant-activation-decision — Epic-companion to #1515. Pure decision
// function for the post-merge-automation `consultant-activation` job.
// Without this guard, the workflow races with label-lint's auto-transition
// (added in #1515): label-lint completes status:testing→status:done, then
// consultant-activation reads pre-race labels and overrides back to
// status:review + role:consultant. Pattern recurred on #1279, #1374,
// #1521, #1536, #1489, #1540 before this fix.
//
// Decision rules:
//   1. Issue is already terminal (status:done / status:cancelled OR state:
//      closed) → skip; the lifecycle is complete.
//   2. CONSULTANT_CLOSEOUT exists in the comment trail → skip; the
//      consultant has already signed off, no activation needed.
//   3. Issue not at status:testing → skip (existing behavior).
//   4. Otherwise → activate (flip status:testing→status:review +
//      role:consultant).

const TERMINAL_LABELS = ['status:done', 'status:cancelled'];
const CLOSEOUT_HEADER_RE = /(^|\n)\s*(?:\*\*|##\s+)?CONSULTANT_CLOSEOUT(?:_EPIC_CLOSEOUT)?\b/;
// #2877: stale-baton-detector — detects COLLABORATOR_HANDOFF posted but labels
// not advanced to status:testing. Refs #2872 (AC-R2).
const COLLAB_HANDOFF_RE = /(^|\n)\s*(?:\*\*|##\s+)?COLLABORATOR_HANDOFF\b/;

function hasCloseoutComment(comments) {
  return (comments || []).some((c) => CLOSEOUT_HEADER_RE.test((c && c.body) || ''));
}

function hasCollabHandoffComment(comments) {
  return (comments || []).some((c) => COLLAB_HANDOFF_RE.test((c && c.body) || ''));
}

function decide({ state, labels = [], comments = [] }) {
  if (state === 'closed') {
    return { action: 'skip', reason: 'issue-closed-terminal' };
  }
  if (labels.some((l) => TERMINAL_LABELS.includes(l))) {
    return { action: 'skip', reason: 'already-terminal-label' };
  }
  if (hasCloseoutComment(comments)) {
    return { action: 'skip', reason: 'closeout-already-posted' };
  }
  // #2877: stale-baton-detector — COLLABORATOR_HANDOFF found but labels not
  // advanced from status:in-progress to status:testing.
  if (labels.includes('status:in-progress') && !labels.includes('status:testing')) {
    if (hasCollabHandoffComment(comments)) {
      return { action: 'warn-and-advance', reason: 'stale-baton-collab-handoff-not-advanced', target: 'status:testing' };
    }
  }
  if (!labels.includes('status:testing')) {
    return { action: 'skip', reason: 'not-at-status-testing' };
  }
  return {
    action: 'activate',
    removeLabelsMatching: /^(status:|role:admin)/,
    addLabels: ['status:review', 'role:consultant'],
    reason: 'standard-activation',
  };
}

module.exports = {
  decide, hasCloseoutComment, hasCollabHandoffComment,
  TERMINAL_LABELS, CLOSEOUT_HEADER_RE, COLLAB_HANDOFF_RE,
};
