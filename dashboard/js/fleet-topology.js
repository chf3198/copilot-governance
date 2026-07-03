// Fleet Topology — compact SVG network graph
// Shows all routable devices with offline legend + reasons

function renderFleetTopology(devices) {
  if (!devices.length) return '<p class="topo-empty">No fleet devices.</p>';
  const routable = devices.filter(d => d.tailscaleIP);
  const W = 440, H = 130, CY = 55;
  const gap = routable.length > 1
    ? (W - 160) / (routable.length - 1) : 0;
  const nodes = routable.map((d, i) => ({
    ...d, x: 80 + i * gap, y: CY
  }));
  const links = [];
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      links.push({ a: nodes[i], b: nodes[j] });

  const linksSvg = links.map(l => {
    const on = l.a.status === 'healthy' && l.b.status === 'healthy';
    const cls = on ? 'mesh-link active' : 'mesh-link';
    const mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2;
    return `<line x1="${l.a.x}" y1="${l.a.y}" x2="${l.b.x}"
      y2="${l.b.y}" class="${cls}"/>
      <text x="${mx}" y="${my - 6}" text-anchor="middle"
        class="link-label">Tailscale</text>`;
  }).join('');

  const nodesSvg = nodes.map(n => {
    const col = statusColor(n.status);
    const icon = n.local ? '⭐' : n.openclaw ? '⚡' : n.ollama ? '🤖' : '💻';
    const reason = n.status === 'offline' ? topoOfflineReason(n) : '';
    return `<circle cx="${n.x}" cy="${n.y}" r="16" fill="var(--surface)"
        stroke="${col}" stroke-width="2" class="topo-node"/>
      <text x="${n.x}" y="${n.y + 4}" text-anchor="middle"
        class="topo-icon">${icon}</text>
      <text x="${n.x}" y="${n.y + 30}" text-anchor="middle"
        class="topo-label">${esc(n.alias)}</text>
      <text x="${n.x}" y="${n.y + 40}" text-anchor="middle"
        class="topo-sub">${esc(n.tailscaleIP)}${reason}</text>
      <circle cx="${n.x + 11}" cy="${n.y - 11}" r="4"
        fill="${col}" class="topo-dot"/>`;
  }).join('');

  const svg = `<svg viewBox="0 0 ${W} ${H}" class="topo-svg"
    role="img" aria-label="Fleet topology">
    <defs><style>
      .mesh-link{stroke:var(--border);stroke-width:1.5;stroke-dasharray:5,3}
      .mesh-link.active{stroke:var(--green);stroke-width:2;
        stroke-dasharray:none;opacity:.6}
      .link-label{font-size:7px;fill:var(--text-muted);font-style:italic}
      .topo-icon{font-size:12px;fill:var(--text);pointer-events:none}
      .topo-label{font-size:8px;fill:var(--text);font-weight:600}
      .topo-sub{font-size:6px;fill:var(--text-muted)}
    </style></defs>${linksSvg}${nodesSvg}</svg>`;

  return `<div class="topo-wrap">${svg}${topoLegend(devices)}</div>`;
}

function topoOfflineReason(d) {
  if (!d.tailscale) return ' (no TS)';
  if (d.notes?.includes('Not yet')) return ' (pending)';
  return ' (unreachable)';
}

function topoLegend(devices) {
  const hasDeg = devices.some(d => d.status === 'degraded');
  const hasOff = devices.some(d => d.status === 'offline');
  const hasUnk = devices.some(d => d.status === 'unknown');
  return `<div class="topo-legend">
    <span><span class="dot green"></span> Healthy</span>
    ${hasDeg ? '<span><span class="dot yellow"></span> Degraded</span>' : ''}
    ${hasOff ? '<span><span class="dot red"></span> Offline</span>' : ''}
    ${hasUnk ? '<span><span class="dot grey"></span> Unknown</span>' : ''}
    <span><span class="line green"></span> Active</span>
    <span><span class="line grey"></span> Inactive</span>
    <span>⭐ Primary</span> <span>⚡ OpenClaw</span>
    <span>🤖 Ollama</span> <span>💻 Device</span></div>`;
}

function statusColor(s) {
  const m = { healthy: 'var(--green)', degraded: 'var(--yellow)',
    offline: 'var(--red)' };
  return m[s] || 'var(--text-muted)';
}
