// Dashboard actions split out to keep app.js compact

function setDashboardView(app, view) { app.currentView = view; if (['cost','wiki','agents'].includes(view)) app.refreshAll(); }

function isDashboardView(app, view) {
  return app.currentView === view;
}

function toggleDashboardTips(app) {
  app.tooltipsEnabled = !app.tooltipsEnabled;
  app.config.tooltipsEnabled = app.tooltipsEnabled;
  saveDashboardConfig(app.config);
  if (!app.tooltipsEnabled) clearTooltip(app);
}

function setRefreshSec(val) {
  const el = document.querySelector('[x-data]');
  const app = Alpine.$data(el);
  app.config.refreshSec = Math.max(3, Math.min(60, Number(val)));
  saveDashboardConfig(app.config);
  app.scheduleRefresh();
}

const STRESS_HARD_STOP_SEC = 62;
const STRESS_EARLY_STOP_SEC = 30;

async function runDashboardQuickTest(app) {
  if (app.testRun.running) return;
  const tickets = buildParallelTickets();
  const t0 = performance.now();
  app.testRun = {
    running: true, rounds: 0, ok: 0, fail: 0,
    last: 'warming up', tickets, elapsed: 0,
    startedAt: new Date().toLocaleTimeString()
  };
  addActivity(app.activityLog, 'test', '🧪 Stress test started',
    `${tickets.length} tickets · 60s`);

  const DURATION_MS = 60000, INTERVAL_MS = 1500;
  const maxRounds = Math.ceil(DURATION_MS / INTERVAL_MS);

  for (let i = 0; i < maxRounds; i++) {
    await new Promise(r => setTimeout(r, INTERVAL_MS));
    const elapsed = (performance.now() - t0) / 1000;
    if (elapsed > STRESS_HARD_STOP_SEC) break;

    // Advance random non-done ticket
    const active = tickets.filter(t => t.status !== 'done');
    if (active.length) {
      const ticket = active[Math.floor(Math.random() * active.length)];
      advanceTicket(ticket);
      const agent = AGENT_NAMES[ticket.role] || 'system';
      addActivity(app.activityLog, 'baton',
        `[${agent}] ${ticket.id}: ${ticket.label}`, ticket.role);
    }

    // Mock router log entry every round
    const mock = mockRouterEntry();
    addRouterLogEntry(mock.agent, mock.model, `[test] ${mock.lane} lane`);
    addActivity(app.activityLog, 'router',
      `${mock.agent} → ${mock.model}`, mock.lane);

    // Update baton state with all active tickets
    app.batonState = tickets.filter(t => t.status !== 'done')
      .map(t => ({
        activeRole: t.role, issue: t.id,
        status: t.status === 'done' ? 'done' : 'in-progress',
        agent: AGENT_NAMES[t.role] || ''
      }));

    app.testRun.rounds = i + 1;
    app.testRun.ok += 2;
    app.testRun.elapsed = elapsed;
    app.testRun.last = active.length
      ? `${active[0].id}: ${active[0].role}` : 'completing';
    app.testRun.tickets = [...tickets];

    // Cycle device status for topology exercise
    if (i % 4 === 0 && app.devices.length > 1) {
      const d = app.devices[i % app.devices.length];
      const states = ['healthy', 'degraded', 'offline'];
      d.status = states[i % states.length];
    }

    // All tickets done? Keep going for router/activity exercise
    if (!active.length && elapsed > STRESS_EARLY_STOP_SEC) break;
  }

  app.testRun.running = false;
  app.testRun.elapsed = (performance.now() - t0) / 1000;
  app.testRun.last = `✅ ${tickets.length} tickets · ${app.testRun.rounds} rounds`;
  app.batonState = [];
  // Restore device status
  app.devices.forEach(d => { d.status = d._origStatus || d.status; });
  addActivity(app.activityLog, 'test',
    `Stress test complete: ${app.testRun.ok} checks`);
}
