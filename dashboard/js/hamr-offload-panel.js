// #3015 — offload KPI widgets from /api/hamr-offload (Epic #3008 AC-E5).
async function fetchHamrOffload() {
  const response = await fetch('/api/hamr-offload');
  if (!response.ok) throw new Error('hamr-offload unavailable');
  return response.json();
}
function renderHamrOffload(payload) {
  const k = (payload && payload.kpi) || {};
  const reasons = (k.top_escalation_reasons || []).map((x) => `<li>${x.reason}: ${x.count}</li>`).join('') || '<li>none</li>';
  return `<section class="hamr-offload" aria-label="HAMR offload KPIs">
    <div>offload coverage 7d: <strong>${Math.round((k.offload_coverage_7d || 0) * 1000) / 10}%</strong></div>
    <div>gate quality 7d: <strong>${Math.round((k.gate_quality_7d || 0) * 1000) / 10}%</strong></div>
    <div>incidents 7d: <strong>${k.incident_rate_7d || 0}</strong></div>
    <ul>${reasons}</ul></section>`;
}
async function registerHamrOffloadPanel(el) {
  if (!el) return;
  try { el.innerHTML = renderHamrOffload(await fetchHamrOffload()); }
  catch (e) { el.innerHTML = `<p class="hamr-error">${e.message}</p>`; }
}
if (typeof window !== 'undefined') { window.registerHamrOffloadPanel = registerHamrOffloadPanel; }
if (typeof module !== 'undefined') module.exports = { renderHamrOffload, fetchHamrOffload };
