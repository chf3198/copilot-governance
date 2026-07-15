'use strict';
// ga sensor — governance-audit violations (#1257). Per Phase-0 R&D §2 (#1247).
const VIOLATION_BUDGET_PER_WEEK = 14;

function compute({ violationCount = 0 } = {}) {
  const value = Math.min(1, violationCount / VIOLATION_BUDGET_PER_WEEK);
  return { value, evidence: [`${violationCount} violations / ${VIOLATION_BUDGET_PER_WEEK} budget`] };
}

module.exports = { compute, VIOLATION_BUDGET_PER_WEEK };
