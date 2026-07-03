// transport-mocks.js — demo mode overrides for ALL data-fetch globals
// Loads LAST (after all other scripts) to override function declarations.
/* eslint-disable no-unused-vars */
if (window.IS_DEMO) (function () {
  'use strict';
  const DEMO_K = { FLEET_CALLS: 187, TICKET: 2809, MS_60S: 60000, MS_30S: 30000, LATENCY_HIGH: 380, LATENCY_LOW: 15, TOKENS_TODAY: 187400, PAID_TOKENS: 48800, RECONCILED: 183, MS_PER_DAY: 86400000, MS_2MIN: 120000, CF_NEURONS: 8900, Q_LIMIT_FLEET: 500, CF_LIMIT: 10000, Q_LIMIT_COPILOT: 300, TODAY: new Date().toISOString().slice(0, 10) };
  const DEVICES = [
    { id: 'fleet-win-01', alias: 'Fleet Windows Host', role: 'primary-fleet-inference', modelCount: 6, tailscaleIP: '100.x.x.1', ollama: true, openclaw: false, local: false, status: 'healthy' },
    { id: 'fleet-openclaw', alias: 'OpenClaw Host', role: 'primary-inference', modelCount: 7, tailscaleIP: '100.x.x.2', ollama: true, openclaw: true, local: false, status: 'healthy' },
    { id: 'dev-1', alias: 'Dev Unit 1', role: 'sml-agent', modelCount: 4, tailscaleIP: '100.x.x.3', ollama: true, openclaw: false, local: false, status: 'degraded' },
    { id: 'local-dev', alias: 'Local Dev', role: 'primary-dev', modelCount: 0, tailscaleIP: null, ollama: false, openclaw: false, local: true, status: 'healthy' },
  ];
  const SERVICES = [
    { id: 'github-copilot', name: 'GitHub Copilot', type: 'paid', cost: '$19/mo', status: 'active' },
    { id: 'openrouter',     name: 'OpenRouter',     type: 'paid', cost: 'metered', status: 'active' },
    { id: 'hamr-worker',    name: 'HAMR Worker',    type: 'free', cost: 'free',    status: 'active' },
  ];
  window.loadDevices  = async function () { return DEVICES; };
  window.loadServices = async function () { return SERVICES; };
  window.runHealthChecks = async function (devices) {
    const isDeg = window.demoConfig && window.demoConfig.currentScenario === 'governance-alert';
    return Object.fromEntries((devices || []).map(function (d) {
      if (d.local) return [d.id, { status: 'healthy' }];
      if (isDeg && d.id === 'dev-1') return [d.id, { status: 'degraded', models: ['qwen3.5:0.8b'] }];
      return [d.id, { status: 'healthy', models: d.id === 'fleet-win-01'
        ? ['qwen3:32b', 'qwen2.5-coder:32b', 'starcoder2:3b'] : ['qwen2.5-coder:7b', 'deepseek-coder-v2:lite'] }];
    }));
  };
  window.mergeHealthStatus = function (devices, checks) {
    return (devices || []).map(function (d) { return Object.assign({}, d, checks[d.id] || {}); });
  };
  window.fetchAllFleetStats = async function () {
    return { 'fleet-win-01': { tokPerSec: 80.5, activeModel: 'starcoder2:3b', utilPct: 42 },
      'fleet-openclaw': { tokPerSec: 8.4, activeModel: 'qwen2.5-coder:7b', utilPct: 18 },
      'dev-1': { tokPerSec: 12.1, activeModel: 'qwen3.5:0.8b', utilPct: 5 } };
  };
  window.fetchAllLiveQuotas = async function () {
    return [{ id: 'openrouter', name: 'OpenRouter Credits', used: 2.84, limit: 10, percent: 28, period: 'account' },
      { id: 'cloudflare-ai', name: 'Cloudflare AI Neurons', used: DEMO_K.CF_NEURONS, limit: DEMO_K.CF_LIMIT, percent: 89, period: 'daily' }];
  };
  window.pollEventBus = async function () { return []; };
  window.fetchRouterLaneStats = async function () { return { fleet: { calls: DEMO_K.FLEET_CALLS, pct: 74 }, haiku: { calls: 41, pct: 16 }, premium: { calls: 26, pct: 10 }, free: { calls: 0, pct: 0 } }; };
  window.fetchWikiHealth = async function () { return { loaded: true, pages: 47, stale: 2 }; };
  window.fetchWikiMetrics = async function () {
    return { total: 47, fresh: 45, stale: 2, avgTrust: 0.91, grade: 82, score: 82, totalAccess: 134,
      lastAccess: new Date().toISOString(), sections: { concepts: 42, howto: 31, reference: 24, sessions: 17 },
      pages: { 'harness-goal-controls': 18, 'role-baton-routing': 14, 'demo-mode': 11, 'fleet-dispatch': 9, 'governance-chain': 7 },
      gradeReasons: ['2 stale pages', 'All index links valid'] };
  };
  window.pollGitHub        = async function () {
    return { issues: { open: 12, recent: [{ number: DEMO_K.TICKET, title: 'Phase-1 dashboard', state: 'open' }] }, pulls: { open: 1, merged: 3, recent: [] }, actions: { recent: [] }, branches: { count: 2, active: ['main', 'feat/dashboard-demo'] } };
  };
  window.fetchFleetHealthLog = async function () {
    const isDeg = window.demoConfig && window.demoConfig.currentScenario === 'governance-alert';
    return [{ ts: Date.now() - DEMO_K.MS_60S, node: 'fleet-win-01', status: 'healthy', latencyMs: 12 },
      { ts: Date.now() - DEMO_K.MS_30S, node: 'fleet-openclaw', status: 'healthy', latencyMs: 47 },
      { ts: Date.now(), node: 'dev-1', status: isDeg ? 'degraded' : 'healthy', latencyMs: isDeg ? DEMO_K.LATENCY_HIGH : DEMO_K.LATENCY_LOW }];
  };
  window.fetchGovernanceState = async function () {
    return { ticketFirst: { status: 'pass', violations: 0 }, signerFidelity: { status: 'pass', violations: 0 },
      lintRequired: { status: 'pass', violations: 0 }, testEvidence: { status: 'pass', violations: 0 }, lastChecked: new Date().toISOString() };
  };
  window.fetchCostTelemetry = async function () {
    const nowMs = Date.now();
    const e = [7200000,5400000,3600000,1800000,900000].map(function(d,i){
      const lanes=['fleet','fleet','haiku','fleet','premium'], models=['qwen3:32b','qwen2.5-coder:7b','claude-haiku-3','qwen3:32b','claude-sonnet-4'];
      return {ts:new Date(nowMs-d).toISOString(),lane:lanes[i],model:models[i]};
    });
    return {entries:e,summary:null};
  };
  window.fetchTokenTelemetrySummary = async function () {
    return { todayTokens: DEMO_K.TOKENS_TODAY, fleetPct: 74,
      paidTokens: DEMO_K.PAID_TOKENS, fleetSavingsUsd: 0.19,
      paidSpendUsd: 0.23, samples: 42,
      totals: { total_tokens: DEMO_K.TOKENS_TODAY },
      confidence: { exact: 0.82, estimated: 0.15, other: 0.03 },
      nonFreeCoverage: { samples: 12, share: 0.29 },
      providers: [
        { provider: 'fleet-ollama', samples: 30, total_tokens: 138600 },
        { provider: 'anthropic', samples: 12, total_tokens: 48800 }
      ] };
  };
  window.fetchQualityParitySummary  = async function () {
    return { fleetPassRate: 0.94, paidPassRate: 0.97, delta: 0.03, judgeCalls: 42,
      mean: 94, floor: 90, calibratedFloor: 91,
      meanParity: 0.94, parityFloor: 0.90, floorDelta: 0.03, calibrated_floor: 0.91,
      readiness: { liveMode: true } };
  };
  window.fetchGoalHealthSummary = async function () {
    const goalDefs = {G1:['Governance',9],G2:['Quality',8],G3:['Zero Cost',9],G4:['Privacy',8],G5:['Portability',7],G6:['Resilience',8],G7:['Throughput',7],G8:['Observability',8],G9:['Interop',7]};
    return Object.fromEntries(Object.entries(goalDefs).map(function(e){return [e[0],{score:e[1][1],label:e[1][0]}];}));
  };
  window.fetchTokenReconcileSummary = async function () { return { matched: DEMO_K.RECONCILED, unmatched: 4, matchRate: 0.978 }; };
  window.fetchAgentSessions = async function () { return [{ id: 's1', agent: 'copilot', model: 'claude-sonnet-4.6', ticket: DEMO_K.TICKET, status: 'active', startTs: Date.now() - DEMO_K.MS_2MIN, costUsd: 0.0041 }]; };
  window.buildQuotaList = function () {
    return [{ id: 'copilot-pro', name: 'Copilot Pro Requests', used: DEMO_K.FLEET_CALLS, limit: DEMO_K.Q_LIMIT_COPILOT, percent: 62, period: 'monthly' },
      { id: 'hamr-worker', name: 'HAMR Worker Calls', used: 89, limit: DEMO_K.Q_LIMIT_FLEET, percent: 18, period: 'daily' },
      { id: 'litellm', name: 'LiteLLM Fleet Tokens', used: DEMO_K.FLEET_CALLS, limit: DEMO_K.Q_LIMIT_FLEET, percent: 37, period: 'daily' }];
  };
})();
