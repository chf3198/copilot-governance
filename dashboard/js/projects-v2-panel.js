'use strict';
// projects-v2-panel (#1651) — dashboard read-only panel surfacing cross-team
// Projects v2 board state. Mounts into existing dashboard server.

function renderProjectsV2Panel(targetEl, items) {
  if (!targetEl) return;
  if (!items || items.length === 0) {
    targetEl.innerHTML = '<p class="empty">No cross-team items in flight.</p>';
    return;
  }
  const rows = items.map(item => {
    const num = item.content?.number ?? '?';
    const title = (item.content?.title || '').slice(0, 60);
    const claim = item.claimedBy || '—';
    const lane = item.crossTeamStage || '—';
    return `<tr><td>#${num}</td><td>${title}</td><td>${claim}</td><td>${lane}</td></tr>`;
  }).join('');
  targetEl.innerHTML = `<table class="projects-v2-board">
    <thead><tr><th>#</th><th>Title</th><th>Claimed by</th><th>Stage</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function loadAndRender(targetEl, fetcher = globalThis.fetch) {
  try {
    const response = await fetcher('/api/projects-v2/in-flight');
    if (!response.ok) throw new Error('fetch failed');
    const data = await response.json();
    renderProjectsV2Panel(targetEl, data.items || []);
  } catch (error) {
    if (targetEl) targetEl.innerHTML = `<p class="error">Cross-team board unavailable: ${error.message}</p>`;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderProjectsV2Panel, loadAndRender };
}
