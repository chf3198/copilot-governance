// Wiki Reader — browse real wiki pages from /api/wiki-pages.
// #1682: auto-record top-N slugs per category on render so pages map is
// populated (not just first file per category). Forward-compat with
// Epic #1942: wikiType discriminator defaults to 'wisdom' for the
// current Karpathy Wiki; Phase-1 can pass other types.

let _wikiPagesCache = [];
let _lastAutoRecord = 0;
const AUTO_RECORD_INTERVAL_MS = 3600000;
const TOP_N_PER_CATEGORY = 10;

async function loadWikiPages() {
  try {
    const r = await fetch('/api/wiki-pages');
    if (!r.ok) return [];
    _wikiPagesCache = await r.json();
    return _wikiPagesCache;
  } catch { return []; }
}

function getWikiPages() { return _wikiPagesCache; }

function renderWikiReader(pages) {
  if (!pages || !pages.length) {
    return '<p class="wiki-empty">No wiki pages found.</p>';
  }
  const cats = {};
  for (const p of pages) {
    const cat = p.type || 'unknown';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(p);
  }
  const now = Date.now();
  if (now - _lastAutoRecord > AUTO_RECORD_INTERVAL_MS) {
    Object.entries(cats).forEach(([cat, files]) => {
      if (typeof trackWikiAccess !== 'function') return;
      trackWikiAccess(cat, '');
      files.slice(0, TOP_N_PER_CATEGORY).forEach(file => {
        if (file?.slug) trackWikiAccess(cat, file.slug);
      });
    });
    _lastAutoRecord = now;
  }
  const typeLabel = {
    entities: '📦 Entities', concepts: '💡 Concepts',
    sources: '📄 Sources', syntheses: '🔬 Syntheses',
  };
  const sections = Object.entries(cats).map(([cat, files]) => {
    const label = typeLabel[cat] || `📁 ${cat}`;
    const items = files.map(f => {
      const name = esc(f.title || f.slug);
      const slug = f.slug || '';
      const onclick = `trackWikiAccess('${esc(cat)}','${esc(slug)}')`;
      return `<li class="wiki-link" onclick="${onclick}">${name}
        <small class="wiki-tags">${(f.tags || []).map(
        t => '<span class="wiki-tag">' + esc(t) + '</span>'
      ).join('')}</small></li>`;
    }).join('');
    return `<details class="wiki-section" open>
      <summary onclick="trackWikiAccess('${esc(cat)}','')">${label} (${files.length})</summary>
      <ul class="wiki-list">${items}</ul></details>`;
  }).join('');
  const total = pages.length;
  const catCount = Object.keys(cats).length;
  return `<div class="wiki-reader">
    <div class="wiki-summary">${total} pages · ${catCount} types</div>
    ${sections}</div>`;
}
