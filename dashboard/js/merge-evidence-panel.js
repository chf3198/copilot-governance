// Merge-Evidence Panel — per-team rolling 7d closed-without-merge counts.
// Epic #1486 Phase-1d (#1508). Consumes /api/merge-evidence-stats. Shows
// staleness banner when the snapshot is missing or older than 24h.

async function fetchMergeEvidenceData() {
  const response = await fetch('/api/merge-evidence-stats');
  if (!response.ok) throw new Error('merge-evidence unavailable');
  return response.json();
}

function statusBadge(count) {
  if (count === 0) return '<span class="me-badge me-ok" aria-label="zero violations">✓ 0</span>';
  if (count < 3) return `<span class="me-badge me-low" aria-label="${count} violations">! ${count}</span>`;
  return `<span class="me-badge me-high" aria-label="${count} violations">⚠ ${count}</span>`;
}

function renderTeamRow(team, count) {
  return `<tr class="me-row me-row-${count === 0 ? 'ok' : (count < 3 ? 'low' : 'high')}">
    <td class="me-team">${team}</td>
    <td class="me-status">${statusBadge(count)}</td>
  </tr>`;
}

function renderStaleBanner(payload) {
  if (payload.status === 'absent') {
    return `<p class="me-warn">Snapshot absent. Run <code>npm run merge-evidence:snapshot</code> to populate.</p>`;
  }
  if (payload.status === 'malformed') {
    return `<p class="me-warn">Snapshot malformed: ${payload.error}</p>`;
  }
  if (payload.status === 'stale') {
    const hours = Math.round(payload.age_ms / 3600e3);
    return `<p class="me-warn">Snapshot is ${hours}h old (>24h). Refresh recommended.</p>`;
  }
  return '';
}

function renderMergeEvidencePanel(payload) {
  if (!payload) return '<section class="merge-evidence-panel"><p>No data.</p></section>';
  const banner = renderStaleBanner(payload);
  const snapshot = payload.snapshot || { by_team: {}, counts: {}, window_days: 7 };
  const teams = Object.entries(snapshot.by_team || {}).sort((a, b) => b[1] - a[1]);
  const rows = teams.length
    ? teams.map(([team, count]) => renderTeamRow(team, count)).join('')
    : '<tr><td colspan="2" class="me-empty">No violations in window.</td></tr>';
  const counts = snapshot.counts || {};
  const window = snapshot.window_days || 7;
  return `<section class="merge-evidence-panel">
    <h3 class="me-title">Closed without merge (${window}d)</h3>
    ${banner}
    <table class="me-table" role="table" aria-label="Per-team closed-without-merge counts">
      <thead><tr><th>Team</th><th>Violations</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="me-summary">Total: ${counts.violations || 0} violations · ${counts.passed || 0} passed · ${counts.skipped || 0} skipped (lightweight/epic/override)</p>
  </section>`;
}

async function registerMergeEvidencePanel(targetElement) {
  if (!targetElement) return;
  try {
    const payload = await fetchMergeEvidenceData();
    targetElement.innerHTML = renderMergeEvidencePanel(payload);
  } catch (error) {
    targetElement.innerHTML = `<p class="me-error">Failed to load: ${error.message}</p>`;
  }
}

if (typeof window !== 'undefined') {
  window.registerMergeEvidencePanel = registerMergeEvidencePanel;
  window.renderMergeEvidencePanel = renderMergeEvidencePanel;
  window.fetchMergeEvidenceData = fetchMergeEvidenceData;
}
