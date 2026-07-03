// Context Flow — SVG diagram showing prompt → LLM → response chain
// Shows all fleet resources that send/receive context

function renderContextFlow() {
  const W = 620, H = 260;
  const nodes = [
    { x: 60, y: 50, icon: '💻', label: 'VS Code', sub: 'Copilot Agent', tip: 'IDE sends prompts with file context, conversation history, and MCP tool results to the AUTO router.' },
    { x: 200, y: 50, icon: '🧠', label: 'AUTO', sub: 'Model Select', tip: 'Routes prompts to Cloud LLM (primary) or OpenClaw (local fallback) based on model availability and rate limits.' },
    { x: 370, y: 50, icon: '☁️', label: 'Cloud LLM', sub: 'Copilot API', tip: 'GitHub Copilot cloud models (GPT-4o, Claude). Primary route. Responses stream back to VS Code.' },
    { x: 540, y: 50, icon: '🐙', label: 'GitHub', sub: 'API + Actions', tip: 'GitHub API: issues, PRs, commits. Actions CI/CD. Context flows bidirectionally via gh CLI and webhooks.' },
    { x: 120, y: 150, icon: '🌐', label: 'Tailscale', sub: 'VPN Mesh', tip: 'Encrypted WireGuard mesh connecting all fleet devices. Routes traffic between fleet hosts.' },
    { x: 290, y: 150, icon: '⚡', label: 'OpenClaw', sub: 'LiteLLM Proxy', tip: 'LiteLLM proxy on fleet host. Routes to local Ollama models. Fallback when cloud is rate-limited.' },
    { x: 460, y: 150, icon: '🤖', label: 'Ollama', sub: 'Local LLM', tip: 'Local inference on fleet host. Runs quantized open-source models. Accessed via OpenClaw proxy over Tailscale.' },
    { x: 60, y: 210, icon: '💻', label: 'Dev-1', sub: 'Workstation', tip: 'Primary dev workstation. Runs VS Code + dashboard.' },
    { x: 200, y: 210, icon: '💻', label: 'Dev-2', sub: 'SLM node', tip: 'Secondary dev node: runs Ollama with small models for lightweight local inference.' },
    { x: 370, y: 210, icon: '🖥️', label: 'Fleet Host', sub: 'OpenClaw host', tip: 'Fleet compute node. Hosts OpenClaw + Ollama. Primary local LLM inference.' },
  ];
  const arrows = [
    { from: 0, to: 1, label: 'prompt', tip: 'User prompt + file context + conversation history sent to model router' },
    { from: 1, to: 2, label: 'cloud', tip: 'Primary route: prompt sent to GitHub Copilot cloud API' },
    { from: 1, to: 5, label: 'local', dashed: true, tip: 'Fallback route: prompt sent to OpenClaw LiteLLM proxy over Tailscale' },
    { from: 5, to: 6, label: 'inference', tip: 'OpenClaw forwards to local Ollama for model inference' },
    { from: 4, to: 5, label: 'mesh', dashed: true, tip: 'Tailscale VPN tunnels traffic between devices' },
    { from: 7, to: 4, label: '', dashed: true, tip: 'Dev-1 connects to Tailscale mesh' },
    { from: 8, to: 4, label: '', dashed: true, tip: 'Dev-2 connects to Tailscale mesh' },
    { from: 9, to: 5, label: 'host', tip: 'Fleet host runs OpenClaw proxy locally' },
    { from: 0, to: 3, label: 'gh cli', tip: 'VS Code uses gh CLI for issue/PR operations' },
  ];
  return `<div class="cf-wrap"><svg viewBox="0 0 ${W} ${H}"
    class="cf-svg" role="img" aria-label="Context flow diagram">
    <defs>${cfDefs()}</defs>
    ${cfArrows(nodes, arrows)}${cfNodes(nodes)}</svg>
    ${contextBudgetLegend()}</div>`;
}
function cfDefs() {
  return `<marker id="cfHead" markerWidth="6" markerHeight="4"
    refX="6" refY="2" orient="auto">
    <polygon points="0 0, 6 2, 0 4" fill="var(--green)"/></marker>
  <style>.cf-arrow{stroke:var(--green);stroke-width:1.5;opacity:.7}
  .cf-arrow.dashed{stroke-dasharray:4,3;stroke:var(--yellow)}
  .cf-node{fill:var(--surface);stroke:var(--border);stroke-width:1;cursor:pointer}
  .cf-node:hover{stroke:var(--blue);stroke-width:2}
  .cf-icon{font-size:13px;fill:var(--text);pointer-events:none}
  .cf-name{font-size:9px;fill:var(--text);font-weight:600;pointer-events:none}
  .cf-sub{font-size:7px;fill:var(--text-muted);pointer-events:none}
  .cf-lbl{font-size:7px;fill:var(--text-muted);font-style:italic}</style>`;
}
function cfArrows(nodes, arrows) {
  return arrows.map(a => {
    const f = nodes[a.from], t = nodes[a.to];
    const cls = a.dashed ? 'cf-arrow dashed' : 'cf-arrow';
    const mx = (f.x + t.x) / 2, my = (f.y + t.y) / 2;
    return `<line x1="${f.x}" y1="${f.y}" x2="${t.x}" y2="${t.y}"
      class="${cls}" marker-end="url(#cfHead)"><title>${a.tip}</title></line>
      ${a.label ? `<text x="${mx}" y="${my - 4}" text-anchor="middle"
        class="cf-lbl">${a.label}</text>` : ''}`;
  }).join('');
}
function cfNodes(nodes) {
  return nodes.map(n => `<g class="cf-node-g">
    <rect x="${n.x - 36}" y="${n.y - 20}" width="72" height="40"
      rx="6" class="cf-node"><title>${n.tip}</title></rect>
    <text x="${n.x}" y="${n.y - 4}" text-anchor="middle" class="cf-icon">${n.icon}</text>
    <text x="${n.x}" y="${n.y + 8}" text-anchor="middle" class="cf-name">${n.label}</text>
    <text x="${n.x}" y="${n.y + 18}" text-anchor="middle" class="cf-sub">${n.sub}</text>
  </g>`).join('');
}
function contextBudgetLegend() {
  const items = [
    { label: 'System prompt', pct: 10, color: 'var(--blue)' },
    { label: 'Conversation', pct: 35, color: 'var(--green)' },
    { label: 'File context', pct: 25, color: 'var(--yellow)' },
    { label: 'MCP tools', pct: 10, color: 'var(--text-muted)' },
    { label: 'User message', pct: 5, color: 'var(--red)' },
    { label: 'Headroom', pct: 15, color: 'var(--border)' },
  ];
  const bars = items.map(i => `<div class="cb-seg"
    style="flex:${i.pct};background:${i.color}"
    title="${i.label}: ~${i.pct}%"></div>`).join('');
  const labels = items.map(i =>
    `<span><span class="dot" style="background:${i.color}"></span>
    ${i.label}</span>`).join('');
  return `<div class="cb-bar">${bars}</div>
    <div class="cb-legend">${labels}</div>`;
}
