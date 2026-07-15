// Render Panels — JS template functions for Alpine x-html

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;').replace(/`/g, '&#96;');
}

function renderDeviceCards(devices) {
  if (!devices.length) {
    return '<div class="card"><p>No devices loaded yet.</p></div>';
  }
  return devices.map(d => `<div class="card device-card ${d.status}">
    <div class="card-header"><strong>${esc(d.alias)}</strong>
      <span class="badge ${d.status}">${d.status==='offline'?'unreachable':d.status==='error'?'service error':d.status}</span></div>
    <div class="card-body">
      <p><span class="label">Role:</span> ${esc(d.role)}</p>
      <p><span class="label">RAM:</span> ${esc(d.ram)}</p>
      <p><span class="label">Models:</span> ${d.modelCount} loaded</p>
    </div></div>`).join('');
}

const SERVICE_URLS = {
  'copilot-pro': 'https://github.com/settings/copilot',
  'cloudflare': 'https://dash.cloudflare.com/',
  'google-ai-studio': 'https://aistudio.google.com/',
  'groq': 'https://console.groq.com/',
  'cerebras': 'https://cloud.cerebras.ai/',
  'openrouter': 'https://openrouter.ai/activity',
  'openclaw': (window.__fleetConfig?.openclawURL || '') + '/ui/'
};

function renderServiceCards(services) {
  if (!services.length) return '<div class="card"><p>No services loaded yet.</p></div>';
  return services.map(s => {
    const url = SERVICE_URLS[s.id] || '';
    const link = url ? `<p><a href="${esc(url)}" target="_blank" rel="noopener" class="svc-link">Open dashboard ↗</a></p>` : '';
    return `<div class="card service-card ${s.status}">
      <div class="card-header"><strong>${esc(s.name)}</strong>
        <span class="badge ${s.status}">${s.status}</span></div>
      <div class="card-body">
        <p><span class="label">Cost:</span> ${esc(s.cost)}</p>${link}
      </div></div>`;
  }).join('');
}

function renderQuotaPanel(live, statics) {
  const costs = typeof buildServiceCosts === 'function' ? buildServiceCosts() : [];
  const costHtml = costs.length ? `<div class="quota-costs">${costs.map(c =>
    `<div class="quota-cost"><a href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.name)}</a>
      <span class="quota-price">${esc(c.cost)}</span>
      <span class="quota-detail">${esc(c.detail)}</span></div>`
  ).join('')}</div>` : '';
  const renderRow = q => {
    const note = q.note ? `<span class="quota-note">${esc(q.note)}</span>` : '';
    const link = q.link ? `<a href="${esc(q.link)}" target="_blank" class="quota-ext">↗</a>` : '';
    return `<div class="quota-row">
      <span class="quota-name">${esc(q.name)}${link}</span>
      <div class="quota-bar"><div class="progress-fill
        ${q.percent > 80 ? 'warn' : 'ok'}"
        style="width:${Math.max(q.percent, 2)}%"></div></div>
      <span class="quota-val">${note || `${q.used ?? q.usage ?? 0}/${q.limit}`}</span>
    </div>`;
  };
  const a = live.map(renderRow).join('');
  const b = statics.map(renderRow).join('');
  return `${costHtml}<div class="quota-grid">${a}${b}</div>`;
}

function renderFleetStats(stats) {
  const rows = Object.entries(stats);
  if (!rows.length) return '<div class="stat-card"><p class="stat-offline">No live stats yet.</p></div>';
  return rows.map(([id, st]) => {
    if (!st.online) return `<div class="stat-card">
      <div class="stat-header"><strong>${esc(id)}</strong></div>
      <p class="stat-offline">Device offline</p></div>`;
    const pct = Math.min(100, st.running.length * 33);
    const ver = st.version
      ? `<span class="version">v${esc(st.version)}</span>` : '';
    const models = st.models.map(m => {
      const dot = st.running.some(r => r.name === m.name)
        ? '<span class="active-dot">●</span>' : '';
      return `<li><span>${dot}${esc(m.name)}</span>
        <span>${esc(m.params)} ${esc(m.quant)}</span></li>`;
    }).join('');
    return `<div class="stat-card">
      <div class="stat-header">
        <strong>${esc(id)}</strong>${ver}</div>
      <div class="stat-row">
        <div class="gauge" style="background:conic-gradient(
          var(--green) ${pct}%,var(--border) 0)">
          <div class="gauge-inner">${st.running.length}</div></div>
        <div><div>${st.models.length} models</div>
          <div style="font-size:.8rem;color:var(--text-muted)">
            ${st.running.length} running</div></div>
      </div>
      <ul class="model-list">${models}</ul></div>`;
  }).join('');
}
