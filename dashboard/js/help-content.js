// Help Content — comprehensive help center with search
// Uses HELP_USER_SECTIONS and HELP_DEV_SECTIONS from split files

function renderWikiLinks(body) {
  return body.replace(/\[\[([\w-]+)\]\]/g, (_m, name) =>
    `<a href="#" class="wiki-link" title="Open wiki: ${name}" onclick="Alpine.$data(document.querySelector('[x-data]')).setView('wiki');return false;">${name}</a>`);
}

function getHelpSections(devMode) {
  const user = typeof HELP_USER_SECTIONS !== 'undefined'
    ? HELP_USER_SECTIONS : [];
  const dev = typeof HELP_DEV_SECTIONS !== 'undefined'
    ? HELP_DEV_SECTIONS : [];
  return devMode ? [...user, ...dev] : user;
}

function switchHelpTab(tab) {
  localStorage.setItem('helpTab', tab);
  document.querySelectorAll('.help-pane').forEach(p => p.hidden = p.dataset.tab !== tab);
  document.querySelectorAll('.help-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
}

function renderHelpPanel(devMode) {
  const tab = localStorage.getItem('helpTab') || 'user';
  const sections = getHelpSections(true);
  if (!sections.length) return '<p class="help-empty">Help content loading…</p>';
  const byId = {};
  for (const s of sections) byId[s.id] = s;
  const mkSec = id => { const s = byId[id]; if (!s) return '';
    return `<details id="help-${s.id}" class="help-section" data-help-id="${s.id}"><summary>${s.title}</summary><div class="help-body">${renderWikiLinks(s.body)}</div></details>`; };
  const mkCat = (title, ids) =>
    `<div class="help-category"><h3 class="help-cat-title">${title}</h3>${ids.map(mkSec).join('')}</div>`;
  const pane = (id, html) =>
    `<div class="help-pane" data-tab="${id}"${tab !== id ? ' hidden' : ''} role="tabpanel">${html}</div>`;
  const TABS = { user: '👤 User Guide', dev: '🔧 Dev Guide', api: '📡 API Ref', changelog: '📋 Changelog' };
  const tabBar = `<div class="help-tabs" role="tablist">${Object.entries(TABS).map(([id, label]) =>
    `<button class="help-tab${tab === id ? ' active' : ''}" data-tab="${id}" onclick="switchHelpTab('${id}')" role="tab">${label}</button>`
  ).join('')}</div>`;
  const toolbar = `<div class="help-toolbar"><input type="text" class="help-search" placeholder="Search help…" oninput="filterHelpSections(this.value)"/></div>`;

  const userHtml = [
    mkCat('🚀 Getting Started', ['start-what', 'start-tour']),
    mkCat('📖 Live & Logs', ['use-baton', 'use-health', 'use-context', 'use-activity', 'use-ticket-log']),
    mkCat('📊 Ops & Governance', ['use-quotas', 'use-governance', 'use-github']),
    mkCat('🌐 Fleet & Wiki', ['use-devices', 'use-services', 'use-settings', 'use-config', 'use-wiki-reader']),
    mkCat('🧪 Troubleshooting', ['use-stress', 'trouble-offline', 'trouble-stale']),
  ].join('');
  const devHtml = mkCat('👨‍💻 For Developers',
    ['dev-arch', 'dev-files', 'dev-alpine', 'dev-panel', 'dev-api', 'dev-test', 'dev-contribute', 'dev-skills']);
  const apiHtml = `<h3 class="help-cat-title">Panel API quick-reference</h3>
    <ul class="help-api-list">
      <li><code>renderBatonFlow(state)</code> → Baton panel HTML</li>
      <li><code>renderQuotaPanel(live, statics)</code> → Quotas HTML</li>
      <li><code>renderAgentInventory()</code> → Agent roster HTML</li>
      <li><code>renderGovernancePanel(state)</code> → Governance HTML</li>
      <li><code>fetchFleetHealthLog()</code> → Promise&lt;event[]&gt;</li>
      <li><code>wrapProviderCall(provider, fn, opts)</code> → HAMR-governed call</li>
    </ul>`;
  const clHtml = `<p><a href="https://github.com/chf3198/megingjord-harness/blob/main/CHANGELOG.md"
    target="_blank" class="svc-link">View CHANGELOG.md on GitHub ↗</a></p>
    <p class="help-empty">All versioned release notes and breaking changes are tracked there.</p>`;
  return `${toolbar}${tabBar}
    ${pane('user', userHtml)}${pane('dev', devHtml)}${pane('api', apiHtml)}${pane('changelog', clHtml)}
    <div class="help-feedback">
      <a href="https://github.com/chf3198/devenv-ops/issues/new" target="_blank" class="svc-link">📝 Report issue</a>
      <a href="https://github.com/chf3198/devenv-ops/issues/new?labels=enhancement" target="_blank" class="svc-link">💡 Request feature</a></div>`;
}

function filterHelpSections(query) {
  const q = (query || '').toLowerCase();
  document.querySelectorAll('.help-section').forEach(el => {
    const text = el.textContent.toLowerCase();
    el.style.display = !q || text.includes(q) ? '' : 'none';
  });
}
