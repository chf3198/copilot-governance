// fixture-runner.js — JSONL scenario replay engine for demo mode
// Drives activityLog and batonState from scenario event files.

const fixtureRunner = (function () {
  'use strict';

  const FIXTURE_BASE = 'fixtures/';
  const TICK_MS = 1200;
  let _timer = null;
  let _events = [];
  let _idx = 0;
  let _app = null;

  async function loadScenario(name) {
    const meta = await fetch(FIXTURE_BASE + 'meta.json').then(function (r) { return r.json(); });
    const scenario = meta.scenarios.find(function (sc) { return sc.name === name; }) || meta.scenarios[0];
    window.demoConfig = window.demoConfig || {};
    window.demoConfig.currentScenario = scenario.name;
    const text = await fetch(FIXTURE_BASE + scenario.file).then(function (r) { return r.text(); });
    return text.trim().split('\n').filter(Boolean).map(function (l) { return JSON.parse(l); });
  }

  function applyEvent(app, ev) {
    if (ev.type === 'baton') {
      const entry = { issue: ev.issue, activeRole: ev.role,
        status: 'in-progress', message: ev.message,
        title: ev.title || '', agent: ev.agent || '',
        model: ev.model || '', detail: ev.detail || '' };
      const existing = (app.batonState || []).filter(function (b) { return b.issue !== ev.issue; });
      app.batonState = existing.concat([entry]);
      window._demoFixtureBatonState = app.batonState;
      return;
    }
    if (ev.type === 'router') {
      window.demoConfig = window.demoConfig || {};
      window.demoConfig.routerLog = window.demoConfig.routerLog || [];
      window.demoConfig.routerLog.unshift({
        time: new Date().toLocaleTimeString(),
        agent: ev.lane || 'auto', model: ev.model || '?',
        task: ev.decision || '' }); return;
    }
    if (ev.type === 'ticket') {
      window.demoConfig = window.demoConfig || {};
      window.demoConfig.ticketLog = window.demoConfig.ticketLog || [];
      window.demoConfig.ticketLog.unshift({
        issue: ev.number || ev.issue,
        title: ev.title || '', status: ev.action || 'backlog',
        activeRole: ev.role || null }); return;
    }
    const typeMap = { warn: 'warn', llm: 'llm', tool: 'tool', agent: 'agent', system: 'system' };
    const evType = typeMap[ev.type] || 'system';
    const msg = ev.message || ev.type.replace(/_/g, ' ');
    const detail = ev.detail || '';
    if (typeof addActivity === 'function') {
      addActivity(app.activityLog, evType, msg, detail);
    } else if (app.activityLog) {
      app.activityLog.unshift({ type: evType, message: msg, detail: detail, ts: Date.now() });
      if (app.activityLog.length > 100) app.activityLog.pop();
    }
  }

  function tick() {
    if (!_app || !_events.length) return;
    applyEvent(_app, _events[_idx % _events.length]);
    _idx++;
  }

  async function start(app, scenarioName) {
    _app = app;
    stop();
    _events = await loadScenario(scenarioName || 'healthy-session');
    _idx = 0;
    _timer = setInterval(tick, TICK_MS);
  }

  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  async function switchScenario(name) {
    const wasRunning = !!_timer;
    stop();
    _events = await loadScenario(name);
    _idx = 0;
    if (wasRunning && _app) _timer = setInterval(tick, TICK_MS);
  }

  return { start: start, stop: stop, switch: switchScenario };
})();

window.fixtureRunner = fixtureRunner;
