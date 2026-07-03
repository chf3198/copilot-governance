'use strict';
// Optimistic-lock helper for label-lint auto-transition (#3034 C6).

function labelSet(labels) {
  return [...(labels || [])].map(l => (typeof l === 'string' ? l : l.name)).sort().join(',');
}

function labelsDrifted(before, after) {
  return labelSet(before) !== labelSet(after);
}

function shouldAbortTransition(beforeLabels, afterLabels, beforeUpdatedAt, afterUpdatedAt) {
  if (labelsDrifted(beforeLabels, afterLabels)) return { abort: true, reason: 'label-drift' };
  if (beforeUpdatedAt && afterUpdatedAt && beforeUpdatedAt !== afterUpdatedAt) {
    return { abort: true, reason: 'issue-updated-at-drift' };
  }
  return { abort: false };
}

module.exports = { labelsDrifted, shouldAbortTransition, labelSet };
