// Tooltips + Help panel
const TIP_COPY = {
  refresh: ['Refresh', 'Polls all endpoints now.', 'fleet', 'controls'],
  auto: ['Auto refresh', 'Toggle 60s polling.', 'fleet', 'controls'],
  test: ['Stress test', '12 lightweight rounds.', 'fleet', 'controls'],
  tips: ['Tooltips', 'Toggle hover help.', 'help', 'controls'],
  contrast: ['Contrast', 'High-contrast theme.', 'fleet', 'controls'],
  help: ['Help center', 'Full searchable documentation.', 'help', 'views'],
  'view-live': ['Live view', 'Real-time baton, activity, and context flow.', 'live', 'use-baton'],
  'view-logs': ['Logs view', 'Streaming health, router, and ticket logs.', 'logs', 'use-health'],
  'view-fleet': ['Fleet view', 'Devices, services, credentials, config.', 'fleet', 'use-devices'],
  'view-ops': ['Ops view', 'GitHub, quotas, router, governance, LLM context.', 'ops', 'use-quotas'],
  'view-wiki': ['Wiki', 'Research wiki browser and metrics.', 'wiki', 'views'],
  'view-help': ['Help', 'Full searchable documentation.', 'help', 'views'],
  settings: ['Fleet Resources', 'LLM credential store and health probes.', 'fleet', 'use-settings'],
  'wiki-metrics': ['Wiki Metrics', 'Detailed wiki access and quality statistics.', 'wiki', 'use-wiki-metrics'],
  baton: ['Agent Baton', 'Live ticket pipeline. Each row = one active ticket. Highlighted step = current role holder. Timeline at bottom = baton handoff history (role icon + time received). Closed tickets move to Ticket Log.', 'fleet', 'use-baton'],
  'fleet-health': ['Fleet Health Log', 'Timestamped device health events. Online/offline transitions, latency spikes, SSH check results.', 'fleet', 'use-health'],
  activity: ['Live Activity', 'Event stream: role transitions, git ops, deploys, tests. Newest on top. Max 30 entries.', 'fleet', 'use-activity'],
  'resource-mon': ['Resources', 'OpenClaw proxy + Tailscale mesh status.', 'fleet', 'resources'],
  'context-flow': ['Context Flow', 'Prompt routing diagram: VS Code → AUTO → Cloud LLM or OpenClaw → Ollama. Replaced old Fleet Topology.', 'fleet', 'use-context'],
  'llm-context': ['LLM Context Windows', 'Token usage per model: prompt/completion/total and context fill %.', 'ops', 'use-quotas'],
  github: ['GitHub Activity', 'Recent commits, PRs, issues from devenv-ops repo.', 'ops', 'use-github'],
  quotas: ['Quotas', 'Daily API usage bars. Red = near limit. Resets at midnight UTC.', 'ops', 'use-quotas'],
  router: ['Task Router Lanes', 'Task distribution across Free/Fleet/Premium lanes by device.', 'ops', 'use-router'],
  'router-log': ['LLM Router Log', 'Per-request model selection: agent, model, task, timestamp.', 'ops', 'use-router'],
  governance: ['Governance', 'Baton adherence, missing handoff events, AC coverage gaps.', 'ops', 'use-governance'],
  'ticket-log': ['Ticket Log', 'Full audit trail of all tickets. Active first; closed/cancelled collapsed.', 'logs', 'use-ticket-log'],
  wiki: ['Wiki Health', 'Page count, coverage %, staleness metrics.', 'wiki', 'use-wiki-metrics'],
  'wiki-reader': ['Wiki Reader', 'Browse and search research/ markdown pages.', 'wiki', 'use-wiki-reader'],
  devices: ['Fleet Devices', 'Device inventory: name, Tailscale IP, RAM, OS, role.', 'fleet', 'use-devices'],
  services: ['Services', 'API service cards: endpoint, status, last checked.', 'fleet', 'use-services'],
  config: ['Settings', 'Dashboard preferences: refresh interval, contrast, tooltips.', 'fleet', 'use-config'],
  'test-panel': ['Stress Test', 'Simulates 5 parallel tickets + mock events. ~60s.', 'fleet', 'use-stress'],
  'tl-step': ['Baton handoff', 'Role icon + time the baton was received. Hover for role description.', 'fleet', 'use-baton'],
};

// renderHelpPanel is in help-content.js — removed from here

function filterHelp(q) {
  filterHelpSections(q);
}

function initTooltips(app) {
  const tip = document.getElementById('app-tip');
  let hideTimer = null;

  window._tipNav = (view, helpId) => {
    app.currentView = 'help';
    app.activeTip = '';
    setTimeout(() => {
      const el = document.getElementById('help-' + helpId);
      if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth' }); }
    }, 200);
  };

  function showTip(node) {
    if (!app.tooltipsEnabled) return;
    const key = node.dataset.tip;
    const [t, d, view, helpId] = TIP_COPY[key] || ['Info', '', 'fleet', ''];
    app.activeTip = `<strong>${esc(t)}</strong><p>${esc(d)}</p>`
      + `<button class="tip-nav" onclick="_tipNav('${view}','${helpId}')"
          >Help: ${esc(t)} →</button>`;
    const rect = node.getBoundingClientRect(), tw = 220;
    let left = Math.max(4, Math.min(
      rect.left + rect.width / 2 - tw / 2, innerWidth - tw - 4));
    let top = rect.bottom + 2;
    if (top + 80 > innerHeight) top = rect.top - 80;
    Object.assign(tip.style, {
      left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto'
    });
  }

  document.addEventListener('mouseover', e => {
    if (!app.tooltipsEnabled) return;
    if (e.target.closest('#app-tip')) { clearTimeout(hideTimer); return; }
    const node = e.target.closest('[data-tip]');
    if (node) { clearTimeout(hideTimer); showTip(node); }
  });
  document.addEventListener('mouseout', e => {
    const leaving = e.target.closest('[data-tip]');
    if (!leaving) return;
    if (e.relatedTarget?.closest('#app-tip')) return;
    hideTimer = setTimeout(() => { app.activeTip = ''; }, 500);
  });
  tip?.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(() => { app.activeTip = ''; }, 400);
  });
}

function clearTooltip(app) { app.activeTip = ''; }
function toggleHelpMode() {
  const el = document.querySelector('[x-data]');
  const d = Alpine.$data(el);
  d.helpDevMode = !d.helpDevMode;
}
