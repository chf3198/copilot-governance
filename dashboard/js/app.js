// Dashboard App — Alpine.js root component

function dashboardApp() {
  return {
    devices: [], services: [], quotas: [], liveQuotas: [],
    fleetStats: {}, routerStats: {},
    config: { refreshSec: 5, highContrast: false },
    currentView: 'live', helpDevMode: false, agentSessions: [],
    batonState: [], ticketLog: [], activityLog: [], governanceState: {},
    wikiHealth: { loaded: false }, wikiMetrics: null, wikiPages: [],
    githubData: null,
    fleetHealthLog: [], costData: [], tokenTelemetry: null, qualityParity: null, goalHealth: null, reconcileData: null, panelTs: {},
    tooltipsEnabled: false, autoRefreshEnabled: true,
    refreshTimer: null, testTimer: null,
    testRun: { running: false, rounds: 0, ok: 0, fail: 0, last: 'idle' },
    activeTip: '', loading: false, lastRefresh: 'initializing…',

    get overallStatus() {
      if (!this.devices.length) return 'initializing';
      const checked = this.devices.filter(d => d.status !== 'unknown');
      if (!checked.length) return 'initializing';
      if (checked.every(d => d.status === 'healthy')) return 'healthy';
      return 'degraded';
    },

    async init() {
      this.config = loadDashboardConfig();
      document.body.classList.toggle('high-contrast', this.config.highContrast);
      this.tooltipsEnabled = !!this.config.tooltipsEnabled;
      initTooltips(this);
      this.wikiPages = typeof loadWikiPages === 'function' ? await loadWikiPages() : [];
      await this.loadInventory();
      await this.refreshAll();
      this.scheduleRefresh();
      if (typeof connectSSE === 'function') connectSSE(this);
      if (typeof initContextFlowEvents === 'function') initContextFlowEvents();
      this.lastRefresh = new Date().toLocaleTimeString();
      addActivity(this.activityLog, 'system', 'Dashboard initialized',
        `${this.devices.length} devices loaded`);
    },

    async loadInventory() {
      this.devices = await loadDevices();
      this.services = await loadServices();
      this.quotas = buildQuotaList(this.services);
    },

    async refreshAll() {
      this.loading = true;
      try {
        const ids = this.devices.filter(d => d.ollama).map(d => d.id);
        const [checks, stats, lq, rs, evBaton] = await Promise.all([
          runHealthChecks(this.devices), fetchAllFleetStats(ids),
          fetchAllLiveQuotas(), fetchRouterLaneStats(),
          pollEventBus(this.activityLog)
        ]);
        this.devices = mergeHealthStatus(this.devices, checks);
        this.fleetStats = stats;
        this.routerStats = rs;
        this.ticketLog = getTicketLog(); if (lq.length) this.liveQuotas = lq;
        this.wikiHealth = await fetchWikiHealth(); if (typeof fetchWikiMetrics==='function') this.wikiMetrics=await fetchWikiMetrics();
        if (typeof pollGitHub === 'function') { this.githubData = await pollGitHub();
          if (this.githubData?.issues?.recent) pruneClosedFromGitHub(this.githubData.issues.recent); }
        this.batonState = evBaton.length ? evBaton : (typeof getBatonState==='function' ? getBatonState() : buildBatonState(getRouterLog()));
        if (typeof fetchFleetHealthLog === 'function') this.fleetHealthLog = await fetchFleetHealthLog();
        if (typeof fetchGovernanceState === 'function') this.governanceState = await fetchGovernanceState();
        if (typeof fetchCostTelemetry === 'function') this.costData = await fetchCostTelemetry(); if (typeof fetchTokenTelemetrySummary === 'function') this.tokenTelemetry = await fetchTokenTelemetrySummary(); if (typeof fetchQualityParitySummary === 'function') this.qualityParity = await fetchQualityParitySummary().catch(() => null); if (typeof fetchGoalHealthSummary === 'function') this.goalHealth = await fetchGoalHealthSummary().catch(() => null); if (typeof fetchTokenReconcileSummary === 'function') this.reconcileData = await fetchTokenReconcileSummary().catch(() => null);
        if (typeof fetchAgentSessions === 'function') this.agentSessions = await fetchAgentSessions();
        const _ts = new Date().toLocaleTimeString();
        this.panelTs = { github: _ts, quotas: _ts, wiki: _ts, cost: _ts, quality: _ts, goals: _ts, agents: _ts, flow: _ts }; this.lastRefresh = _ts;
      } finally {
        this.loading = false;
      }
    },

    scheduleRefresh() {
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      if (!this.autoRefreshEnabled) return;
      const ms = Math.max(3, Number(this.config.refreshSec || 5)) * 1000;
      this.refreshTimer = setInterval(() => this.refreshAll(), ms);
    },

    toggleAutoRefresh() {
      this.autoRefreshEnabled = !this.autoRefreshEnabled;
      this.scheduleRefresh();
      addActivity(this.activityLog, 'system',
        this.autoRefreshEnabled ? 'Auto-refresh on' : 'Auto-refresh off');
    },
    setHighContrast(on) {
      this.config.highContrast = !!on;
      saveDashboardConfig(this.config);
      document.body.classList.toggle('high-contrast', this.config.highContrast);
    },
    setView(view) { setDashboardView(this, view); },
    isView(view) { return isDashboardView(this, view); },
    toggleTips() { toggleDashboardTips(this); },
    toggleHelpDevMode() { this.helpDevMode = !this.helpDevMode; },
    runQuickTest() { return runDashboardQuickTest(this); }
  };
}
