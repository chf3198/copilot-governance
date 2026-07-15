// Context Resources — quota/LLM usage pills for Context Flow panel
// Maps liveQuotas entries to their context flow node and renders pills
const CF_NODE_MAP = {
  'copilot-pro': 'Cloud LLM',
  'openrouter': 'OpenClaw',
  'cloudflare-ai': 'Cloud LLM',
  'groq': 'Cloud LLM',
  'google-ai': 'Cloud LLM',
  'cerebras': 'Cloud LLM',
};

function cfResourcePills(liveQuotas) {
  if (!liveQuotas || !liveQuotas.length) return '';
  const grouped = {};
  liveQuotas.forEach(q => {
    const node = CF_NODE_MAP[q.id];
    if (!node) return;
    if (!grouped[node]) grouped[node] = [];
    grouped[node].push(q);
  });
  const keys = Object.keys(grouped);
  if (!keys.length) return '';
  const pills = keys.map(node => {
    const items = grouped[node].map(q => {
      const pct = q.percent || 0;
      const col = pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--yellow)' : 'var(--green)';
      const val = q.note || (q.used !== '—' && q.used != null ? `${q.used}/${q.limit}` : '—');
      const name = (q.name || q.id).split(' ').slice(0, 2).join(' ');
      return `<span class="cf-pill" title="${esc(q.name)}: ${esc(String(val))}" style="border-color:${col}">`
        + `${esc(name)} <span style="color:${col}">${pct > 0 ? pct + '%' : val}</span></span>`;
    }).join('');
    return `<div class="cf-res-group"><span class="cf-res-node">${esc(node)}</span>${items}</div>`;
  }).join('');
  return `<div class="cf-resources">${pills}</div>`;
}
