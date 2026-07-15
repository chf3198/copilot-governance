// Wiki Health Panel — card with link to wiki reader view

function renderWikiPanel(wikiHealth) {
  if (!wikiHealth || !wikiHealth.loaded) {
    return `<div class="wiki-empty">
      <span style="font-size:1.2rem">📚</span>
      Scanning wiki pages…
      <span style="font-size:0.72rem">(runs each refresh cycle)</span></div>`;
  }
  const h = wikiHealth;
  const ok = h.issues === 0;
  const cls = ok ? 'healthy' : 'degraded';
  const ts = formatWikiTime(h.lastCheck);

  const stats = `<div class="wiki-row">
    <span class="wiki-stat">${h.pages}<small>pages</small></span>
    <span class="wiki-stat">${h.dirs}<small>cats</small></span>
    <span class="wiki-stat ${cls}">${h.issues}<small>issues</small></span>
  </div>`;

  const sections = [
    ['🔗 Broken', h.broken], ['🏝️ Orphans', h.orphans],
    ['📝 FM', h.frontmatter], ['📇 Index', h.indexSync]
  ];
  const issues = sections
    .filter(([, a]) => a?.length)
    .map(([l, a]) => `<span class="wiki-tag">${l}: ${a.length}</span>`)
    .join('') || '<span class="wiki-ok">All checks pass</span>';

  return `<div class="wiki-card ${cls}">
    <div class="wiki-head">${ok ? '✅' : '⚠️'} <strong>Wiki</strong>
      <span class="badge ${cls}">${h.pages}p</span></div>
    ${stats}
    <div class="wiki-issues">${issues}</div>
    <div class="wiki-actions">
      <button class="wiki-view-btn" onclick="Alpine.$data(document.querySelector('[x-data]')).setView('wiki')">📖 View Wiki</button>
      <span class="wiki-ts">🕐 ${esc(ts)}</span>
    </div>
  </div>`;
}

function formatWikiTime(iso) {
  if (!iso) return 'never';
  try {
    const d = new Date(iso), sec = Math.floor((Date.now() - d) / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return 'unknown'; }
}

async function fetchWikiHealth() {
  try {
    const r = await fetch('/api/wiki-health');
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch {
    return {
      loaded: false, pages: 0, dirs: 0, issues: 0,
      broken: [], orphans: [], frontmatter: [], indexSync: [],
      lastCheck: null,
    };
  }
}
