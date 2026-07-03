'use strict';

function verifySmokeResult({ comments = [], labels = [], expectedParallelPr = '' }) {
  const marker = '<!-- cross-team-pr-parallel-check -->';
  const hasMarker = comments.some(body => String(body || '').includes(marker));
  const hasLabel = labels.includes('coordinator:cross-team-needs-hand-off');
  const hasParallelRow = expectedParallelPr
    ? comments.some(body => String(body || '').includes(`#${expectedParallelPr}`))
    : true;
  const ok = hasMarker && hasLabel && hasParallelRow;
  return {
    ok,
    hasMarker,
    hasLabel,
    hasParallelRow,
    reason: ok ? 'smoke-pass' : 'smoke-fail',
  };
}

module.exports = { verifySmokeResult };
