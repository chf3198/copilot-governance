'use strict';
// cf sensor — Consultant goal-misorder findings (#1257). Per Phase-0 R&D §2.
const GOAL_MISORDER_PATTERN = /goal-misorder|goal-priority/i;

function compute({ closeouts = [] } = {}) {
  if (!closeouts || closeouts.length === 0) return { value: null, evidence: ['no closeouts in window'] };
  const flagged = closeouts.filter(c => c && GOAL_MISORDER_PATTERN.test(c.body || '')).length;
  return { value: flagged / closeouts.length, evidence: [`${flagged}/${closeouts.length} flagged`] };
}

module.exports = { compute };
