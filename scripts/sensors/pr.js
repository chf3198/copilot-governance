'use strict';
// pr sensor — PR review goal-mention rate (#1257). Per Phase-0 R&D §2.
const GOAL_MENTION_PATTERN = /goal-lens|goal-priority/i;

function compute({ reviews = [] } = {}) {
  if (!reviews || reviews.length === 0) return { value: null, evidence: ['no reviews in window'] };
  const flagged = reviews.filter(r => r && GOAL_MENTION_PATTERN.test(r.body || '')).length;
  return { value: flagged / reviews.length, evidence: [`${flagged}/${reviews.length} flagged`] };
}

module.exports = { compute };
