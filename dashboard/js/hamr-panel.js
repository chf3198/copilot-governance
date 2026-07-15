// hamr-panel.js — live HAMR cost-coverage panel (#1159).
// Four G3 widgets from /api/hamr-coverage: cache-hit gauge, per-provider call-mix, premium-share
// governor flag, tier-mix. Renders NAMES/counts only — never a secret value (G4). a11y: shape+text,
// not color-only (WCAG 4.5:1); honors prefers-reduced-motion. Mirrors goal-coverage-panel.js.

async function fetchHamrCoverage() {
  const response = await fetch('/api/hamr-coverage');
  if (!response.ok) throw new Error('hamr-coverage unavailable');
  return response.json();
}

function pct(value) { return `${Math.round((Number(value) || 0) * 1000) / 10}%`; }

function governorBadge(breached) {
  return breached
    ? '<span class="hamr-badge hamr-warn" aria-label="governor breached">▲ over budget</span>'
    : '<span class="hamr-badge hamr-ok" aria-label="within budget">✓ free-lane</span>';
}

function barRow(label, share, calls) {
  const width = Math.max(2, Math.round((Number(share) || 0) * 100));
  return `<tr class="hamr-row"><td class="hamr-label">${label}</td>
    <td class="hamr-bar-cell"><span class="hamr-bar" style="width:${width}%"></span></td>
    <td class="hamr-count">${calls} (${pct(share)})</td></tr>`;
}

function renderHamrPanel(payload) {
  if (!payload || typeof payload.coverage_rate !== 'number') {
    return '<section class="hamr-panel"><p class="hamr-empty">No HAMR coverage data yet.</p></section>';
  }
  const breached = payload.governor && payload.governor.breached;
  const providers = (payload.providers || []).map((p) => barRow(p.name, p.share, p.calls)).join('');
  const tiers = (payload.tier_mix || []).map((t) => barRow(t.tier, t.share, t.calls)).join('');
  return `<section class="hamr-panel${breached ? ' hamr-panel-warn' : ''}" aria-label="HAMR cost coverage">
    <div class="hamr-gauge" role="meter" aria-valuenow="${Math.round(payload.coverage_rate * 100)}"
      aria-valuemin="0" aria-valuemax="100" aria-label="cache hit rate 7d">
      cache-hit 7d: <strong>${pct(payload.coverage_rate)}</strong>
      <small>(SLO ${pct(payload.cache_hit_slo)})</small></div>
    <div class="hamr-governor">premium-share 7d: <strong>${pct(payload.premium_share_7d)}</strong>
      / ${pct(payload.governor && payload.governor.threshold)} ${governorBadge(breached)}</div>
    <table class="hamr-table"><caption>per-provider call mix (7d, ${payload.total_calls_7d} calls)</caption>
      <tbody>${providers || '<tr><td>no calls</td></tr>'}</tbody></table>
    <table class="hamr-table"><caption>tier mix (free/fleet/haiku/premium)</caption>
      <tbody>${tiers || '<tr><td>no calls</td></tr>'}</tbody></table>
  </section>`;
}

async function registerHamrPanel(targetElement) {
  if (!targetElement) return;
  try {
    targetElement.innerHTML = renderHamrPanel(await fetchHamrCoverage());
  } catch (error) {
    targetElement.innerHTML = `<p class="hamr-error">Failed to load: ${error.message}</p>`;
  }
  if (typeof window !== 'undefined' && window.EventSource && !window.__hamrSSE) {
    window.__hamrSSE = new EventSource('/api/events/stream');
    window.__hamrSSE.addEventListener('cache-stats', async () => {
      try { targetElement.innerHTML = renderHamrPanel(await fetchHamrCoverage()); }
      catch { /* silent on transient errors */ }
    });
  }
}

if (typeof window !== 'undefined') {
  window.registerHamrPanel = registerHamrPanel;
  window.renderHamrPanel = renderHamrPanel;
  window.fetchHamrCoverage = fetchHamrCoverage;
}
if (typeof module !== 'undefined') {
  module.exports = { renderHamrPanel, governorBadge, pct, barRow };
}
