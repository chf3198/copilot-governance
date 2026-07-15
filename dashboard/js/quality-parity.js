'use strict';
/** Dashboard module: empirical quality-parity panel. Refs #996. */

async function fetchQualityParitySummary() {
  const response = await fetch('/api/logs/quality-parity');
  if (!response.ok) throw new Error(`quality parity fetch failed: ${response.status}`);
  return response.json();
}

function parityBadge(value) {
  const color = value === 'PASS' ? '#28a745' : value === 'WARN' ? '#fd7e14' : '#dc3545';
  return `<span style="color:${color};font-weight:bold">${esc(value)}</span>`;
}

function renderQualityParityPanel(report) {
  if (!report) return '<p>No quality parity data.</p>';
  const rows = (report.regressions || []).map(row =>
    `<tr><td>${esc(row.id)}</td><td>${esc(row.lane || '—')}</td><td>${(row.parity * 100).toFixed(1)}%</td><td>${(row.jaccard * 100).toFixed(1)}%</td><td>${(row.length_ratio * 100).toFixed(1)}%</td></tr>`
  ).join('');
  const caveat = report.readiness?.liveMode
    ? '<p style="color:#28a745">Live telemetry enabled for empirical calibration.</p>'
    : '<p style="color:#fd7e14">Dry-run corpus only; set QUALITY_PARITY_LIVE=1 for empirical sampling.</p>';
  return `<h4>Empirical Quality Parity <span style="font-size:0.8em;color:#888">${esc(report.mode || '')}</span></h4>
    ${caveat}
    <div class="cost-metric"><span class="cost-label">Mean parity</span><span class="cost-value">${(report.meanParity * 100).toFixed(1)}%</span><span class="cost-budget">floor ${(report.parityFloor * 100).toFixed(1)}%</span></div>
    <table class="cost-table"><thead><tr><th>Gate</th><th>Turns</th><th>Floor delta</th><th>Calibrated floor</th></tr></thead><tbody><tr><td>${parityBadge(report.gate || 'WARN')}</td><td>${report.totalTurns || 0}</td><td>${(report.floorDelta * 100).toFixed(1)}%</td><td>${(report.calibrated_floor * 100).toFixed(1)}%</td></tr></tbody></table>
    <table class="cost-table"><thead><tr><th>Turn</th><th>Lane</th><th>Parity</th><th>Jaccard</th><th>Length</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No regressions captured.</td></tr>'}</tbody></table>`;
}

if (typeof module !== 'undefined') module.exports = { fetchQualityParitySummary, renderQualityParityPanel };
else Object.assign(window, { fetchQualityParitySummary, renderQualityParityPanel });