// Cost Monitor Panel — real-time cost tracking vs $10/month budget
// Reads /api/logs/cost-telemetry (JSONL: {ts,lane,model,...})

const COST_PER_REQ = { free: 0, fleet: 0, haiku: 0.00264, premium: 0.027 };
const BUDGET = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function fetchCostTelemetry() {
  try {
    const [costResp, tokenResp] = await Promise.all([
      fetch('/api/logs/cost-telemetry'), fetch('/api/logs/token-telemetry-summary')
    ]);
    const text = costResp.ok ? await costResp.text() : '';
    const entries = text.trim().split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    const summary = tokenResp.ok ? await tokenResp.json() : null;
    return { entries, summary };
  } catch { return { entries: [], summary: null }; }
}

function calcMonthlyCost(entries) {
  const now = Date.now();
  const oldest = entries.reduce((mn, e) =>
    Math.min(mn, new Date(e.ts).getTime()), now);
  const spanDays = Math.max(1, (now - oldest) / MS_PER_DAY);
  const totalCost = entries.reduce((s, e) =>
    s + (COST_PER_REQ[e.lane] || 0), 0);
  return +(totalCost * (30 / spanDays)).toFixed(4);
}

function tierDistribution(entries) {
  const counts = { free: 0, fleet: 0, haiku: 0, premium: 0 };
  entries.forEach(e => { if (counts[e.lane] !== undefined) counts[e.lane]++; });
  const total = entries.length || 1;
  return Object.entries(counts).map(([lane, n]) => ({
    lane, count: n, pct: Math.round((n / total) * 100)
  }));
}

function renderRecentRows(data) {
  return data.slice(-5).reverse().map(e => {
    const timeStr = e.ts ? new Date(e.ts).toLocaleTimeString() : '';
    const cost = (COST_PER_REQ[e.lane] || 0).toFixed(5);
    return `<div class="cost-row">
      <span class="cost-time">${esc(timeStr)}</span>
      <span class="cost-lane">${esc(e.lane)}</span>
      <span class="cost-model">${esc(e.model||'')}</span>
      <span class="cost-val">$${cost}</span></div>`;
  }).join('');
}

function renderCostMonitor(data) {
  const payload = Array.isArray(data) ? { entries: data, summary: null } : (data || { entries: [], summary: null });
  const entries = payload.entries || [];
  const summary = payload.summary;
  if (!entries.length && !summary?.samples) {
    return `<div class="cost-empty">
      <p>No cost telemetry recorded yet.</p>
      <p class="config-note">Entries appear when routing decisions
        are logged via model-routing-telemetry.js.</p>
    </div>`;
  }
  const monthly = calcMonthlyCost(entries);
  const pct = Math.min(100, Math.round((monthly / BUDGET) * 100));
  const alert = monthly > BUDGET * 0.8;
  const barCls = alert ? 'cost-bar warn' : 'cost-bar ok';
  const badge = alert ? `<span class="cost-badge alert">⚠ >80% budget</span>` : '';
  const distRows = tierDistribution(entries).map(row =>
    `<tr><td>${row.lane}</td><td>${row.count}</td><td>${row.pct}%</td></tr>`
  ).join('');
  const conf = summary?.confidence || { exact: 0, estimated: 0, other: 0 };
  const cov = summary?.nonFreeCoverage || { samples: 0, share: 0 };
  const providers = (summary?.providers || []).slice(0, 4).map(row =>
    `<tr><td>${esc(row.provider)}</td><td>${row.samples}</td><td>${row.total_tokens}</td></tr>`).join('');
  const telemetry = summary?.samples ? `<div class="cost-metric"><span class="cost-label">Token Telemetry</span><span class="cost-value">${summary.totals.total_tokens}</span><span class="cost-budget">tokens / ${summary.samples} samples</span></div><table class="cost-table"><thead><tr><th>Signal</th><th>Value</th><th>Share</th></tr></thead><tbody><tr><td>Exact</td><td>${Math.round(conf.exact * summary.samples)}</td><td>${Math.round(conf.exact * 100)}%</td></tr><tr><td>Estimated</td><td>${Math.round(conf.estimated * summary.samples)}</td><td>${Math.round(conf.estimated * 100)}%</td></tr><tr><td>Non-free lanes</td><td>${cov.samples}</td><td>${Math.round(cov.share * 100)}%</td></tr></tbody></table><table class="cost-table"><thead><tr><th>Provider</th><th>Samples</th><th>Tokens</th></tr></thead><tbody>${providers}</tbody></table></div>` : '';
  return `<div class="cost-summary">
    ${telemetry}
    <div class="cost-metric">
      <span class="cost-label">Est. Monthly Cost</span>
      <span class="cost-value">$${monthly}</span>
      <span class="cost-budget">/ $${BUDGET} budget</span>
      ${badge}
    </div>
    <div class="${barCls}"><div class="cost-fill" style="width:${pct}%"></div></div>
    <table class="cost-table"><thead>
      <tr><th>Lane</th><th>Reqs</th><th>%</th></tr></thead>
      <tbody>${distRows}</tbody></table>
    <div class="cost-recent"><h4>Last 5 Requests</h4>${renderRecentRows(entries)}</div>
  </div>`;
}

if(typeof module!=="undefined")module.exports={fetchCostTelemetry,calcMonthlyCost,tierDistribution,renderCostMonitor};else Object.assign(window,{fetchCostTelemetry,calcMonthlyCost,tierDistribution,renderCostMonitor});
