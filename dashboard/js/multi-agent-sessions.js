// Multi-Agent Sessions — reads .dashboard/agent-heartbeats/ vendor prefix events
// Epic #742 | ≤100 lines

const VENDOR_ICONS = {
  copilot: '🤖', claude: '🟠', codex: '🟦', antigravity: '🌌', cursor: '🎯', cline: '🔧', unknown: '❓'
};
const VENDOR_COLORS = {
  copilot: 'agent-copilot', claude: 'agent-claude', codex: 'agent-codex',
  antigravity: 'agent-antigravity', cursor: 'agent-cursor', cline: 'agent-cline', unknown: 'agent-unknown'
};
const AGENT_HEARTBEAT_KEY = 'agent_heartbeats';
const MAX_VISIBLE = 3;
const MAX_HEARTBEAT_AGE_SEC = 300;

function getSelfVendor() {
  const raw = String(window.__AGENT_VENDOR || window.__AGENT_RUNTIME || '').toLowerCase();
  if (VENDOR_ICONS[raw]) return raw;
  const agentId = String(window.__AGENT_ID || '').toLowerCase();
  return Object.keys(VENDOR_ICONS).find(v => agentId.startsWith(v)) || 'copilot';
}

function getAgentSessionsFromStorage() {
  try {
    const raw = localStorage.getItem(AGENT_HEARTBEAT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function updateAgentHeartbeat(session) {
  const all = getAgentSessionsFromStorage();
  const idx = all.findIndex(s => s.agentId === session.agentId);
  const rec = { ...session, ts: Date.now() };
  if (idx >= 0) all[idx] = rec; else all.push(rec);
  try { localStorage.setItem(AGENT_HEARTBEAT_KEY, JSON.stringify(all)); } catch {}
}

function broadcastSelfHeartbeat() {
  const vendor = getSelfVendor();
  const branch = window.__AGENT_BRANCH || 'unknown';
  const idBranch = window.__AGENT_BRANCH || 'main';
  const self = {
    vendor,
    agentId: window.__AGENT_ID || `${vendor}-${idBranch}`,
    branch,
    ticket: window.__AGENT_TICKET || '',
    activity: 'monitoring',
    ts: Date.now(),
    tier: 'A'
  };
  updateAgentHeartbeat(self);
}

function getActiveAgentSessions(maxAgeSec = MAX_HEARTBEAT_AGE_SEC) {
  const now = Date.now();
  return getAgentSessionsFromStorage()
    .filter(s => (now - s.ts) < maxAgeSec * 1000)
    .sort((a, b) => (a.tier || 'Z').localeCompare(b.tier || 'Z'));
}

function renderAgentCard(s) {
  const icon = VENDOR_ICONS[s.vendor] || '❓';
  const cls = VENDOR_COLORS[s.vendor] || 'agent-unknown';
  const age = Math.round((Date.now() - s.ts) / 1000);
  const ageStr = age < 60 ? `${age}s ago` : `${Math.round(age/60)}m ago`;
  const ticket = s.ticket ? `<a class="agent-ticket" href="#">#${s.ticket}</a>` : '';
  const tierBadge = s.tier === 'C' ? '<span class="tier-badge tier-c">Tier-C</span>' : '';
  return `<div class="agent-card ${cls}" role="article" aria-label="${s.vendor} agent">
    <div class="agent-card-header">${icon} <strong>${s.vendor}</strong>${tierBadge}${ticket}</div>
    <div class="agent-branch" title="branch">⑂ ${s.branch || '—'}</div>
    <div class="agent-activity">${s.activity || '—'}</div>
    <div class="agent-meta"><span class="agent-id">${s.agentId}</span><span class="agent-age">${ageStr}</span></div>
  </div>`;
}

function renderAgentSessions(sessions) {
  if (!sessions || !sessions.length) {
    return '<p class="agent-empty">No active agent sessions detected.</p>';
  }
  const visible = sessions.slice(0, MAX_VISIBLE);
  const overflow = sessions.length - MAX_VISIBLE;
  const cards = visible.map(renderAgentCard).join('');
  const badge = overflow > 0
    ? `<button class="agent-overflow-badge" onclick="this.closest('.agent-grid-wrap').classList.toggle('agent-show-all')">+${overflow} more</button>`
    : '';
  const hiddenCards = overflow > 0
    ? `<div class="agent-hidden-cards">${sessions.slice(MAX_VISIBLE).map(renderAgentCard).join('')}</div>`
    : '';
  return `<div class="agent-grid-wrap"><div class="agent-grid">${cards}</div>${badge}${hiddenCards}</div>`;
}

async function fetchAgentSessions() {
  broadcastSelfHeartbeat();
  return getActiveAgentSessions();
}

window.fetchAgentSessions = fetchAgentSessions;
window.renderAgentSessions = renderAgentSessions;
window.updateAgentHeartbeat = updateAgentHeartbeat;
