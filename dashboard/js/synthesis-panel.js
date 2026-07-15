// Synthesis Panel — surfaces live cross-team R&D synthesis state.
// Refs Epic #1112 AC10 (#2409). Tier-1 (reads .dashboard/synthesis-state.json
// emitted by .github/workflows/cross-team-rd-snapshot.yml #2405).
'use strict';

const PHASE_BADGES = {
  'Pre-flight': 'badge-info', 'Phase-R': 'badge-progress',
  'Phase-D': 'badge-active', 'Phase-C': 'badge-closing',
  'Terminated': 'badge-done',
};

async function fetchSynthesisState() {
  const response = await fetch('/api/synthesis/state', { cache: 'no-store' });
  if (!response.ok) return { runs: [] };
  return response.json();
}

function formatPValue(value) {
  if (value === null || value === undefined) return 'n/a';
  return value < 0.001 ? '< 0.001' : value.toFixed(3);
}

function renderSynthesisRun(run) {
  const phase = run.phase || 'unknown';
  const badgeClass = PHASE_BADGES[phase] || 'badge-default';
  const elapsed = (run.elapsedHours ?? 0).toFixed(1);
  const remaining = (run.remainingHours ?? 0).toFixed(1);
  const latestP = formatPValue(run.latestKsPvalue);
  return `<div class="synthesis-run">
    <div class="synthesis-header">
      <strong>Epic #${run.rdN}</strong>
      <span class="${badgeClass}">${phase}</span>
      <span class="agent-${run.admin || 'unknown'}">admin: ${run.admin || '?'}</span>
    </div>
    <div class="synthesis-progress">
      Wave ${run.wave ?? 0} | ${elapsed}h elapsed | ${remaining}h remaining
      | K-S p: ${latestP} (${run.totalWavesObserved || 0} waves)
    </div>
  </div>`;
}

function renderSynthesisPanel(payload) {
  const runs = payload.runs || [];
  if (runs.length === 0) {
    return '<div class="synthesis-empty">No active cross-team R&D synthesis runs.</div>';
  }
  const rows = runs.map(renderSynthesisRun).join('');
  return `<div class="synthesis-panel"><h3>Cross-Team R&D Synthesis</h3>${rows}</div>`;
}

async function mountSynthesisPanel(targetEl) {
  if (!targetEl) return;
  try {
    const payload = await fetchSynthesisState();
    targetEl.innerHTML = renderSynthesisPanel(payload);
  } catch (err) {
    targetEl.innerHTML = `<div class="synthesis-error">Synthesis state unavailable: ${err.message}</div>`;
  }
}

if (typeof window !== 'undefined') {
  window.mountSynthesisPanel = mountSynthesisPanel;
  window.renderSynthesisPanel = renderSynthesisPanel;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderSynthesisPanel, renderSynthesisRun, formatPValue, fetchSynthesisState, mountSynthesisPanel };
}
