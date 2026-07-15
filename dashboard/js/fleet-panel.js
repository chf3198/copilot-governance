// fleet-panel.js — live fleet utilization dashboard panel (#2526)
// Phase-1 AC6 of Epic #2518. Consumes /api/fleet/in-flight; renders host x model x team table.
'use strict';

const REFRESH_INTERVAL_MS = 30000;

async function fetchInFlight(endpoint = '/api/fleet/in-flight') {
  try {
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (!res.ok) return { entries: [], error: `http_${res.status}` };
    return await res.json();
  } catch (err) {
    return { entries: [], error: err.message };
  }
}

function elapsedSeconds(started_at) {
  return Math.floor((Date.now() - new Date(started_at).getTime()) / 1000);
}

function renderEntry(entry) {
  const elapsed = entry.started_at ? elapsedSeconds(entry.started_at) : 0;
  const eta = entry.eta_s ? `~${entry.eta_s}s ETA` : 'unknown ETA';
  return `<tr class="fleet-row">
    <td>${entry.host}</td>
    <td><code>${entry.model}</code></td>
    <td class="agent-${entry.team}">${entry.team}</td>
    <td>#${entry.ticket || '-'}</td>
    <td>${elapsed}s elapsed</td>
    <td>${eta}</td>
  </tr>`;
}

function renderFleetPanel(payload) {
  if (payload.error) {
    return `<div class="fleet-error">Fleet unreachable: ${payload.error}</div>`;
  }
  const entries = payload.entries || [];
  if (entries.length === 0) {
    return '<div class="fleet-empty">No fleet models currently in-flight.</div>';
  }
  const rows = entries.map(renderEntry).join('');
  return `<div class="fleet-panel"><h3>Fleet in-flight (${entries.length})</h3>
    <table class="fleet-table"><thead><tr>
      <th>Host</th><th>Model</th><th>Team</th><th>Ticket</th><th>Elapsed</th><th>ETA</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function mountFleetPanel(targetEl, endpoint) {
  if (!targetEl) return;
  try {
    const payload = await fetchInFlight(endpoint);
    targetEl.innerHTML = renderFleetPanel(payload);
  } catch (err) {
    targetEl.innerHTML = `<div class="fleet-error">Render failed: ${err.message}</div>`;
  }
}

if (typeof window !== 'undefined') {
  window.mountFleetPanel = mountFleetPanel;
  window.renderFleetPanel = renderFleetPanel;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderFleetPanel, renderEntry, elapsedSeconds, fetchInFlight, mountFleetPanel, REFRESH_INTERVAL_MS };
}
