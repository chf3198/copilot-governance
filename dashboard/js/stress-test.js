// Full-Feature Stress Test — 60s exercise of every dashboard panel
// Mock data for topology, baton, activity, router, wiki, quotas

const TICKET_TEMPLATES = [
  { id: 'T-101', label: 'API endpoint', skills: ['collaborator', 'openclaw'] },
  { id: 'T-102', label: 'UI component', skills: ['web-regression', 'playwright'] },
  { id: 'T-103', label: 'Docs update', skills: ['docs-drift', 'release'] },
  { id: 'T-104', label: 'Security audit', skills: ['secret-prevention', 'hardening'] },
  { id: 'T-105', label: 'Deploy pipeline', skills: ['admin-execution', 'release'] },
];
const ROLE_SEQUENCE = ['manager', 'collaborator', 'admin', 'consultant', 'done'];
const AGENT_NAMES = {
  manager: 'Manny Scope', collaborator: 'Cody Builder',
  admin: 'Addie Merges', consultant: 'Quinn Critic'
};
const MOCK_MODELS = [
  'phi-3.5-mini', 'qwen2.5:7b', 'mistral:7b',
  'gemma3:270m', 'gpt-4o-mini', 'claude-3.5-sonnet'
];
const MOCK_LANES = ['free', 'fleet', 'premium'];

function buildStressTargets() { return TICKET_TEMPLATES; }

function buildParallelTickets() {
  return TICKET_TEMPLATES.map(t => ({
    ...t, roleIdx: 0, role: ROLE_SEQUENCE[0], status: 'pending'
  }));
}

function advanceTicket(ticket) {
  ticket.roleIdx = Math.min(ticket.roleIdx + 1, ROLE_SEQUENCE.length - 1);
  ticket.role = ROLE_SEQUENCE[ticket.roleIdx];
  ticket.status = ticket.role === 'done' ? 'done' : 'active';
  return ticket;
}

function mockRouterEntry() {
  const agent = Object.values(AGENT_NAMES)[Math.floor(Math.random() * 4)];
  const model = MOCK_MODELS[Math.floor(Math.random() * MOCK_MODELS.length)];
  const lane = MOCK_LANES[Math.floor(Math.random() * 3)];
  return { agent, model, lane };
}

function renderStressPanel(run) {
  const cls = run.running ? 'badge active' : 'badge healthy';
  const tickets = run.tickets || [];
  const rows = tickets.map(t => {
    const agent = AGENT_NAMES[t.role] || '—';
    const st = t.status === 'done' ? '✅' : t.status === 'active' ? '🔄' : '⏳';
    return `<div class="stress-ticket">
      <span class="st-id">${st} ${t.id}</span>
      <span class="badge ${t.role === 'done' ? 'healthy' : 'active'}">${t.role}</span>
      <span class="st-agent">${esc(agent)}</span></div>`;
  }).join('');
  const elapsed = run.elapsed ? `${Math.round(run.elapsed)}s` : '—';
  return `<div class="stress-grid">
    <div class="stress-header">
      <span class="${cls}">${run.last || 'idle'}</span>
      <span>Round ${run.rounds || 0} · ${elapsed}</span></div>
    ${tickets.length ? `<div class="stress-tickets">${rows}</div>` : ''}
    <p class="config-note">${TICKET_TEMPLATES.length} parallel tickets ·
      ~60s full exercise · all panels</p></div>`;
}
