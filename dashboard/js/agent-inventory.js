// Agent Inventory — renders defined agent personas for the Agents panel
// Source: agents/roster.json (embedded; update when roster changes)
/* global esc */

const AGENT_ROSTER = [
  { id: 'manny-scope', name: 'Manny Scope', role: 'manager', specialty: 'Scope definition, constraints, AC gates' },
  { id: 'cody-builder', name: 'Cody Builder', role: 'collaborator', specialty: 'General implementation, features, bugfixes' },
  { id: 'rex-research', name: 'Rex Research', role: 'collaborator', specialty: 'Research, analysis, wiki knowledge' },
  { id: 'dash-styles', name: 'Dash Styles', role: 'collaborator', specialty: 'UI/CSS, dashboard, visual design' },
  { id: 'petra-prose', name: 'Petra Prose', role: 'collaborator', specialty: 'Documentation, changelogs, README' },
  { id: 'suki-shield', name: 'Suki Shield', role: 'collaborator', specialty: 'Security hardening, secret scanning, policy' },
  { id: 'iggy-infra', name: 'Iggy Infra', role: 'collaborator', specialty: 'Infrastructure, hooks, scripts, CI/CD' },
  { id: 'addie-merges', name: 'Addie Merges', role: 'admin', specialty: 'Git/PR/release flow, governance checks' },
  { id: 'quinn-critic', name: 'Quinn Critic', role: 'consultant', specialty: 'Post-execution critique, drift scoring' }
];

const INV_ROLE_ICONS = { manager: '🎯', collaborator: '🔧', admin: '⚙️', consultant: '🔍' };

function renderAgentInventory() {
  const groups = ['manager', 'collaborator', 'admin', 'consultant'];
  const html = groups.map(role => {
    const agents = AGENT_ROSTER.filter(a => a.role === role);
    if (!agents.length) return '';
    const cards = agents.map(a =>
      `<div class="inv-card" title="${esc(a.specialty)}">
        <span class="inv-icon">${INV_ROLE_ICONS[role]}</span>
        <span class="inv-name">${esc(a.name)}</span>
        <span class="inv-spec">${esc(a.specialty)}</span>
      </div>`
    ).join('');
    return `<div class="inv-group">
      <h4 class="inv-role-label">${INV_ROLE_ICONS[role]} ${role}</h4>
      <div class="inv-cards">${cards}</div>
    </div>`;
  }).join('');
  return `<section class="agent-inventory" aria-label="Defined agent roster">
    <h3 class="inv-heading">Defined Agents (${AGENT_ROSTER.length})</h3>
    ${html}
  </section>`;
}

window.renderAgentInventory = renderAgentInventory;
