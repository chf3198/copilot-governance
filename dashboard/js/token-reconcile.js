'use strict';
/** Dashboard module: token telemetry reconciliation panel. Refs #774 */

async function fetchTokenReconcileSummary() {
  const r = await fetch('/api/logs/token-telemetry-reconcile');
  if (!r.ok) throw new Error(`reconcile fetch failed: ${r.status}`);
  return r.json();
}

function verdictBadge(v) {
  const colors = { OK: '#28a745', WARN: '#fd7e14', FAIL: '#dc3545', SKIP: '#6c757d', UNREACHABLE: '#aaa' };
  return `<span style="color:${colors[v]||'#000'};font-weight:bold">${esc(v)}</span>`;
}

function renderTokenReconcilePanel(report) {
  if (!report) return '<p>No reconciliation data.</p>';
  const rows = (report.verdicts || []).map(v =>
    `<tr><td>${esc(v.provider)}</td><td>${verdictBadge(v.verdict)}</td>` +
    `<td>${esc(v.lane || '—')}</td><td>${v.confidence_impact != null ? (v.confidence_impact * 100).toFixed(1) + '%' : '—'}</td>` +
    `<td>${v.local_tokens ?? '-'}</td><td>${v.remote_tokens ?? '-'}</td>` +
    `<td>${v.drift_pct != null ? (v.drift_pct * 100).toFixed(1) + '%' : '—'}</td></tr>`
  ).join('');
  const alerts = (report.alerts || []);
  const alertHtml = alerts.length
    ? `<p><b>Alerts (${alerts.length}):</b> ${alerts.map(a => `${esc(a.provider)} ${esc(a.lane || '—')} ${a.verdict}`).join(', ')}</p>`
    : '<p style="color:#28a745">No drift alerts.</p>';
  return `<h4>Token Drift Reconciliation <span style="font-size:0.8em;color:#888">${esc(report.overall||'')}</span></h4>
${alertHtml}
<table class="drift-table"><thead><tr><th>Provider</th><th>Verdict</th><th>Lane</th><th>Confidence impact</th><th>Local</th><th>Remote</th><th>Drift%</th></tr></thead>
<tbody>${rows}</tbody></table>
<p style="font-size:0.8em;color:#888">Thresholds: warn≥${(report.thresholds?.drift_pct||0)*100}% fail≥${(report.thresholds?.drift_pct_fail||0)*100}% · min_samples=${report.thresholds?.min_samples}</p>`;
}

if (typeof module !== 'undefined') module.exports = { fetchTokenReconcileSummary, renderTokenReconcilePanel };
else Object.assign(window, { fetchTokenReconcileSummary, renderTokenReconcilePanel });
