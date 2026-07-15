// Fleet Advisor throughput & pressure panel (Epic #3414 #3485).
// Live-streams the schema-v3 `fleet-advisor.report` event via the shared SSE pipeline and renders
// the headline dollars-saved metric plus per-{host,model} tokens/sec, cold-load, and VRAM pressure.
// Pure view-model logic (summarize/render) is node-testable; the DOM wiring is browser-guarded.

/** Escape a string for safe HTML interpolation (host/model names come from the fleet probe — G4). */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Transform a fleet-advisor.report event into a panel view-model (defensive against missing fields). */
function summarizeReport(event) {
  const e = event || {};
  const hosts = Array.isArray(e.per_host) ? e.per_host : [];
  return {
    tier: e.tier || 'F0',
    dollarsSaved: Number(e.dollars_saved) || 0,
    tokensPerSec: Number(e.tokens_per_sec) || 0,
    coldLoadRate: Number(e.cold_load_rate) || 0,
    fallbackRate: Number(e.free_cloud_fallback_rate) || 0,
    hosts: hosts.map((h) => ({
      host: h.host || 'unknown',
      model: h.model || 'unknown',
      tokensPerSec: Number(h.tokensPerSec) || 0,
      coldLoadRate: Number(h.coldLoadRate) || 0,
      vramPressure: Number(h.vramPressure) || 0,
    })),
  };
}

/** Render the panel HTML from an event (pure string — no DOM dependency, so it is unit-testable). */
function renderFleetAdvisorPanel(event) {
  const vm = summarizeReport(event);
  const rows = vm.hosts.map((h) =>
    `<tr><td>${escapeHtml(h.host)}</td><td>${escapeHtml(h.model)}</td><td>${Number(h.tokensPerSec) || 0}</td>`
    + `<td>${(h.coldLoadRate * 100).toFixed(0)}%</td><td>${(h.vramPressure * 100).toFixed(0)}%</td></tr>`).join('');
  return `<section class="fleet-advisor-panel" data-tier="${escapeHtml(vm.tier)}">`
    + `<h3>Fleet Advisor throughput &amp; pressure</h3>`
    + `<p class="headline">$${vm.dollarsSaved} saved &middot; ${vm.tokensPerSec} tok/s avg &middot; tier ${vm.tier}</p>`
    + `<table><thead><tr><th>Host</th><th>Model</th><th>tok/s</th><th>cold-load</th><th>VRAM</th></tr></thead>`
    + `<tbody>${rows}</tbody></table></section>`;
}

/** Browser wiring: subscribe to the SSE stream and re-render the panel element on each report. */
function initFleetAdvisorPanel(win) {
  const doc = win && win.document;
  if (!doc || typeof win.subscribePanelSSE !== 'function') return false;
  const el = doc.getElementById('fleet-advisor-panel');
  if (!el) return false;
  win.subscribePanelSSE('fleet-advisor.report', (event) => {
    el.innerHTML = renderFleetAdvisorPanel(event);
    if (typeof win.animatePanelUpdate === 'function') win.animatePanelUpdate(el, 'panel-updated');
  });
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { summarizeReport, renderFleetAdvisorPanel, initFleetAdvisorPanel, escapeHtml };
}
