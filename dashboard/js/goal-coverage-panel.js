// Goal Coverage Panel — live G1..G9 signal strength (Epic #1339 C8).
// Closes G8 self-reference. Consumes /api/goal-coverage + SSE updates.

async function fetchGoalCoverageData() {
  const response = await fetch('/api/goal-coverage');
  if (!response.ok) throw new Error('goal-coverage unavailable');
  return response.json();
}

function statusBadge(status) {
  if (status === 'ok') return '<span class="gc-badge gc-ok" aria-label="signal ok">✓</span>';
  if (status === 'low') return '<span class="gc-badge gc-low" aria-label="signal low">!</span>';
  return '<span class="gc-badge gc-gap" aria-label="signal gap">○</span>';
}

function renderGoalCoverageRow(goalId, info) {
  return `<tr class="gc-row gc-row-${info.coverage_status}">
    <td class="gc-id">${goalId}</td>
    <td class="gc-name">${info.name}</td>
    <td class="gc-count">${info.count_24h}</td>
    <td class="gc-count">${info.count_7d}</td>
    <td class="gc-status">${statusBadge(info.coverage_status)}</td>
  </tr>`;
}

function renderGoalCoveragePanel(payload) {
  if (!payload || !payload.coverage) {
    return '<section class="goal-coverage-panel"><p>No coverage data.</p></section>';
  }
  const rows = Object.entries(payload.coverage)
    .map(([goalId, info]) => renderGoalCoverageRow(goalId, info))
    .join('');
  return `<section class="goal-coverage-panel">
    <table class="gc-table" role="table" aria-label="Goal coverage G1 through G9">
      <thead><tr><th>Goal</th><th>Name</th><th>24h</th><th>7d</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="gc-legend">Legend: ✓ ok (≥3/7d) · ! low (1-2/7d) · ○ gap (0/7d)</p>
  </section>`;
}

async function registerGoalCoveragePanel(targetElement) {
  if (!targetElement) return;
  try {
    const payload = await fetchGoalCoverageData();
    targetElement.innerHTML = renderGoalCoveragePanel(payload);
  } catch (error) {
    targetElement.innerHTML = `<p class="gc-error">Failed to load: ${error.message}</p>`;
  }
  // Live update via SSE — listen on the existing dashboard event source if present
  if (typeof window !== 'undefined' && window.EventSource && !window.__goalCoverageSSE) {
    window.__goalCoverageSSE = new EventSource('/api/events/stream');
    window.__goalCoverageSSE.addEventListener('incident', async () => {
      try {
        const refreshed = await fetchGoalCoverageData();
        targetElement.innerHTML = renderGoalCoveragePanel(refreshed);
      } catch { /* silent on transient errors */ }
    });
  }
}

if (typeof window !== 'undefined') {
  window.registerGoalCoveragePanel = registerGoalCoveragePanel;
  window.renderGoalCoveragePanel = renderGoalCoveragePanel;
  window.fetchGoalCoverageData = fetchGoalCoverageData;
}
