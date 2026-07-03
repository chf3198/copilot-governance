// Fleet Health Log Panel — shows device unavailability events
// Fetches from /api/fleet-health and renders timeline

async function fetchFleetHealthLog() {
  try {
    const r = await fetch('/api/fleet-health');
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

function fmtTs(ts) {
  return ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

function renderFleetHealthLog(log) {
  if (!log || !log.length) {
    return `<div class="fleet-log-empty">
      ✅ No fleet issues recorded yet.
      <span style="font-size:0.72rem;display:block;margin-top:0.2rem">
      Events appear when devices go offline or recover.</span>
    </div>`;
  }
  const rows = log.slice(-30).reverse().map(e => {
    const icon = e.status.includes('recovered') ? '🟢' :
      e.status.includes('offline') ? '🔴' : '🟡';
    const time = fmtTs(e.ts);
    return `<div class="fleet-log-row ${e.status}">
      <span class="fleet-log-icon">${icon}</span>
      <span class="fleet-log-time">${esc(time)}</span>
      <span class="fleet-log-device">${esc(e.device)}</span>
      <span class="fleet-log-status">${esc(e.status)}</span>
      <span class="fleet-log-detail">${esc(e.detail || '')}</span>
    </div>`;
  }).join('');
  return `<div class="fleet-log-list">${rows}</div>`;
}
