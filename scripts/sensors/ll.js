'use strict';
// ll sensor — label-lint workflow run failure rate (#1257). Per Phase-0 R&D §2.

function compute({ runs = [] } = {}) {
  if (!runs || runs.length === 0) return { value: null, evidence: ['no runs in window'] };
  const failed = runs.filter(r => r && r.conclusion === 'failure').length;
  return { value: failed / runs.length, evidence: [`${failed}/${runs.length} failed`] };
}

module.exports = { compute };
