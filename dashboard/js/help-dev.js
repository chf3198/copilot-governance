// Help Developer Sections — architecture, patterns, contribution guide

const HELP_DEV_SECTIONS = [
  { id: 'dev-arch', title: '🏗️ Architecture overview',
    body: 'Static HTML/CSS/JS dashboard. Alpine.js v3 for reactive state. No build step. Data flows: inventory JSON → device-monitor.js → health-check.js → app.js state → x-html rendered panels. Events: emit-event.js → .dashboard/events.jsonl → event-bus.js → activity + baton state. <em>Learn more: [[fleet-architecture]]</em>' },
  { id: 'dev-files', title: '📁 File structure reference',
    body: '<strong>dashboard/</strong>: index.html (shell), css/ (per-module styles), js/ (per-module logic).<br><strong>inventory/</strong>: devices.json, services.json.<br><strong>skills/</strong>: SKILL.md per skill.<br><strong>instructions/</strong>: *.instructions.md.<br><strong>scripts/global/</strong>: bootstrap + utility scripts.<br><strong>research/</strong>: ADRs + research wiki pages.' },
  { id: 'dev-alpine', title: '⚡ Alpine.js patterns',
    body: 'Root component: <code>dashboardApp()</code> in app.js. State: devices, services, quotas, batonState, activityLog, wikiPages, config. Rendering: pure JS functions return HTML strings via x-html. Views: x-if for DOM-removing views (Fleet, Resources, Wiki, Help), x-show for Ops (no CLS).' },
  { id: 'dev-panel', title: '➕ Adding a new dashboard panel',
    body: '1. Create <code>js/my-panel.js</code> with <code>renderMyPanel(data)</code>.<br>2. Create <code>css/my-panel.css</code> for styles.<br>3. Add script/link tags to index.html.<br>4. Add state property in app.js <code>dashboardApp()</code>.<br>5. Add panel section in index.html with x-html binding.<br>6. Keep each file ≤100 lines.' },
  { id: 'dev-api', title: '🔌 API endpoint reference',
    body: 'Server: dashboard-server.js on :8090.<br><strong>GET /api/events?since=ts</strong> — JSONL event stream.<br><strong>GET /api/fleet/:id/api/tags</strong> — Ollama proxy.<br><strong>GET /api/router/metrics</strong> — Lane stats.<br><strong>GET /api/wiki-health</strong> — Wiki health (deprecated, use client manifest).' },
  { id: 'dev-test', title: '🧪 Testing guide',
    body: '<strong>Lint</strong>: <code>npm run lint</code> — enforces ≤100 lines per file.<br><strong>Stress test</strong>: 🧪 button exercises all panels with mock data for ~60s.<br><strong>Health check</strong>: <code>npm run health</code> — fleet connectivity.<br><strong>E2E</strong>: <code>npm test</code> — Playwright tests.' },
  { id: 'dev-contribute', title: '🤝 Contributing guide',
    body: '1. Branch: <code>git checkout -b feat/topic</code>.<br>2. Edit files, keep ≤100 lines each.<br>3. Test: <code>npm run lint && npm test</code>.<br>4. Merge: <code>git checkout main && git merge --no-ff</code>.<br>5. Deploy: <code>npm run deploy:apply</code>.<br>6. All changes flow through this repo, never edit ~/.copilot/ directly. <em>Learn more: [[baton-protocol]]</em>' },
  { id: 'dev-skills', title: '🎯 Skill development',
    body: 'Skills live in skills/<name>/SKILL.md. Format: frontmatter + purpose + scope + constraints + instructions + verification. Edit here, test in Copilot Chat, merge, then deploy. 33 skills currently deployed covering GitHub ops, fleet management, and agent governance. <em>Learn more: [[governance-enforcement]]</em>' }
];
