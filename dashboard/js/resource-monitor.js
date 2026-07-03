// Resource Monitor — compact card stack for half-width column
// OpenClaw + Tailscale + Ollama unified view

function renderResourceMonitor(devices, services) {
  const openclaw = services.find(s => s.id === 'openclaw');
  const oc = openclaw ? renderOpenClawCard(openclaw, devices) : '';
  const ts = renderTailscaleCard(devices);
  const ol = renderOllamaCard(devices);
  return `<div class="resource-stack">${oc}${ts}${ol}</div>`;
}

function renderOpenClawCard(svc, devices) {
  const host = devices.find(d => d.openclaw);
  const st = host?.status || 'unknown';
  return `<div class="res-card">
    <span class="resource-icon">⚡</span>
    <strong>OpenClaw</strong>
    <span class="badge ${st}">${st}</span>
    <span class="res-detail">${esc(host?.alias || '?')} · ${(svc.models||[]).length} models</span>
  </div>`;
}

function renderTailscaleCard(devices) {
  const known = devices.filter(d => d.status !== 'unknown');
  const up = known.filter(d => d.tailscaleIP);
  return `<div class="res-card">
    <span class="resource-icon">🔗</span>
    <strong>Tailscale</strong>
    <span class="badge ${up.length === known.length ? 'healthy' : 'degraded'}">${up.length}/${known.length}</span>
    <span class="res-detail">${up.map(d => esc(d.alias)).join(', ')}</span>
  </div>`;
}

function renderOllamaCard(devices) {
  const nodes = devices.filter(d => d.ollama);
  const online = nodes.filter(d => d.status === 'healthy').length;
  const models = nodes.reduce((s, d) => s + d.modelCount, 0);
  const label = online === nodes.length ? 'healthy' : (nodes.length ? 'degraded' : 'unknown');
  const detail = nodes.length
    ? `${models} model${models!==1?'s':''} · ${online} of ${nodes.length} online`
    : 'No Ollama nodes configured';
  return `<div class="res-card">
    <span class="resource-icon">🤖</span>
    <strong>Ollama</strong>
    <span class="badge ${label}">${online}/${nodes.length}</span>
    <span class="res-detail">${detail}</span>
  </div>`;
}
