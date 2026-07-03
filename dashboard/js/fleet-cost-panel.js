// Fleet-cost panel — net cost-of-quality for the fleet-dev program (#2800 P1-7, Epic #2791).
// Convention-matching: `registerFleetCostPanel($el)` is called from the panel's x-init; it fetches
// /api/fleet-cost and renders the share / escalation-rate / NET saving into the element. The pure
// renderer (renderFleetCost) is exported for deterministic tests (no live server needed).

function pct(value) { return `${(Number(value || 0) * 100).toFixed(1)}%`; }
function usd(value) { return `$${Number(value || 0).toFixed(4)}`; }

// Render a report object into `el`. Net value is colour-coded inline (green ≥0 / red <0) so the panel is
// self-contained (no extra stylesheet). Returns the element (testable without a live server).
function renderFleetCost(el, report) {
  if (!el) return el;
  if (!report || report.error) { el.innerHTML = '<div class="fc-error">fleet-cost unavailable</div>'; return el; }
  const net = Number(report.net_cost_of_quality_usd || 0);
  const netColor = net >= 0 ? '#2ea043' : '#d1242f';
  el.innerHTML = [
    `<div class="fc-row"><span>fleet-dev share</span><b data-fc="share">${pct(report.fleet_development_share)}</b></div>`,
    `<div class="fc-row"><span>escalation rate</span><b data-fc="esc">${pct(report.escalation_rate)}</b></div>`,
    `<div class="fc-row"><span>gross saving</span><b data-fc="gross">${usd(report.gross_saving_usd)}</b></div>`,
    `<div class="fc-row"><span>− verification overhead</span><b data-fc="overhead">${usd(report.verification_overhead_usd)}</b></div>`,
    `<div class="fc-row" style="font-weight:bold;color:${netColor}"><span>= NET cost-of-quality (G3)</span><b data-fc="net">${usd(net)}</b></div>`,
  ].join('');
  return el;
}

async function refreshFleetCost(el) {
  try {
    const response = await fetch('/api/fleet-cost');
    renderFleetCost(el, await response.json());
  } catch { renderFleetCost(el, { error: true }); }
}

function registerFleetCostPanel(el) { if (el) refreshFleetCost(el); }

if (typeof module !== 'undefined') module.exports = { renderFleetCost, refreshFleetCost, registerFleetCostPanel, pct, usd };
