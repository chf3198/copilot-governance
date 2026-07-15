/* transport-mocks-extended.js — additional IS_DEMO mocks; loaded after transport-mocks.js */
if (window.IS_DEMO) (function () {
  'use strict';
  const DEMO_TICKET  = 2809;
  const DEMO_PREV    = DEMO_TICKET - 1;
  const MS_14S       = 14000;
  const MS_9S        = 9000;
  const MS_4_5S      = 4500;
  const MS_8S        = 8000;
  const MS_5S        = 5000;
  const MS_2S        = 2000;
  const TOK_FLEET    = 1820;
  const TOK_HAIKU    = 940;
  const TOK_PREMIUM  = 620;
  const COST_HAIKU   = 0.01;
  const COST_PREMIUM = 0.04;

  /* getBatonState — honours _demoFixtureBatonState set by fixture-runner so
   * scenario replay controls baton without the refresh loop overwriting it. */
  window.getBatonState = function () {
    if (window._demoFixtureBatonState && window._demoFixtureBatonState.length) {
      return window._demoFixtureBatonState;
    }
    return [
      { activeRole: 'collaborator', issue: DEMO_TICKET, status: 'in-progress', title: 'Demo Mode Quality Sprint', agent: 'copilot', model: 'claude-sonnet-4' },
    ];
  };

  /* getTicketLog — synchronous; returns demo ticket entries. */
  window.getTicketLog = function () {
    if (window.demoConfig && window.demoConfig.ticketLog && window.demoConfig.ticketLog.length) return window.demoConfig.ticketLog;
    return [
      { issue: DEMO_TICKET, title: 'Demo Mode Quality Sprint', status: 'in-progress', activeRole: 'collaborator' },
      { issue: DEMO_PREV,   title: 'Fix demo device IDs',      status: 'done',        activeRole: null },
    ];
  };

  /* loadWikiPages — async; returns demo wiki page stubs. */
  window.loadWikiPages = async function () {
    return [
      { title: 'Harness Goals',      path: 'wiki/wisdom/global/concepts/harness-goal-controls.md', fresh: true },
      { title: 'Role Baton Routing', path: 'wiki/wisdom/global/concepts/role-baton-routing.md',    fresh: true },
      { title: 'Demo Mode Overview', path: 'wiki/wisdom/global/concepts/demo-mode.md',              fresh: true },
    ];
  };

  /* getRouterLog — synchronous; fallback for buildBatonState when getBatonState absent. */
  window.getRouterLog = function () {
    if (window.demoConfig && window.demoConfig.routerLog && window.demoConfig.routerLog.length) return window.demoConfig.routerLog;
    const now = new Date();
    return [
      { time: new Date(now - MS_8S).toLocaleTimeString(), agent: 'fleet-direct', model: 'qwen2.5-coder:32b', task: 'code review: baton-flow.js' },
      { time: new Date(now - MS_5S).toLocaleTimeString(), agent: 'haiku-escalate', model: 'claude-haiku-3', task: '4-tool chain: refactor transport' },
      { time: new Date(now - MS_2S).toLocaleTimeString(), agent: 'premium', model: 'claude-sonnet-4', task: 'complex analysis: architecture' },
    ];
  };
})();
