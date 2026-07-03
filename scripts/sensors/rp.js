'use strict';
// rp sensor — reopened-with-priority-cause rate (#1257). Per Phase-0 R&D §2.

function compute({ reopens = [] } = {}) {
  if (!reopens || reopens.length === 0) return { value: null, evidence: ['no reopens in window'] };
  const priorityCaused = reopens.filter(r => r && r.priorityCause === true).length;
  return { value: priorityCaused / reopens.length, evidence: [`${priorityCaused}/${reopens.length} priority-cause`] };
}

module.exports = { compute };
