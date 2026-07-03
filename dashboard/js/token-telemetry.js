async function fetchTokenTelemetrySummary() {
  try {
    const resp = await fetch('/api/logs/token-telemetry-summary');
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}

function renderTokenTelemetryPanel(report) {
  if (!report || !report.samples) return `<div class="cost-empty"><p>No token telemetry summary yet.</p></div>`;
  const conf = report.confidence || { exact: 0, estimated: 0, other: 0 };
  const lanes = (report.lanes || []).slice(0, 4).map(row =>
    `<tr><td>${esc(row.lane)}</td><td>${row.samples}</td><td>${row.total_tokens}</td></tr>`).join('');
  const models = (report.models || []).slice(0, 4).map(row =>
    `<tr><td>${esc(row.model)}</td><td>${row.samples}</td><td>${row.total_tokens}</td></tr>`).join('');
  return `<div class="cost-summary"><div class="cost-metric"><span class="cost-label">Unified Token Ledger</span><span class="cost-value">${report.totals.total_tokens}</span><span class="cost-budget">tokens / ${report.samples} routed samples</span></div><table class="cost-table"><thead><tr><th>Confidence</th><th>Share</th><th>Samples</th></tr></thead><tbody><tr><td>Exact</td><td>${Math.round(conf.exact * 100)}%</td><td>${Math.round(conf.exact * report.samples)}</td></tr><tr><td>Estimated</td><td>${Math.round(conf.estimated * 100)}%</td><td>${Math.round(conf.estimated * report.samples)}</td></tr><tr><td>Non-free lanes</td><td>${Math.round((report.nonFreeCoverage?.share || 0) * 100)}%</td><td>${report.nonFreeCoverage?.samples || 0}</td></tr></tbody></table><table class="cost-table"><thead><tr><th>Lane</th><th>Samples</th><th>Tokens</th></tr></thead><tbody>${lanes}</tbody></table><table class="cost-table"><thead><tr><th>Model</th><th>Samples</th><th>Tokens</th></tr></thead><tbody>${models}</tbody></table></div>`;
}

if(typeof module!=="undefined")module.exports={fetchTokenTelemetrySummary,renderTokenTelemetryPanel};else Object.assign(window,{fetchTokenTelemetrySummary,renderTokenTelemetryPanel});