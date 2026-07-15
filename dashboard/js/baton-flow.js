// Baton Flow — Multi-ticket parallel agent baton (M→C→A→Consultant)
/* global detectMissingEvents, getTicketTimeline, esc */ /* exported renderBatonFlow, buildBatonState */

const BATON_ROLES = [
  { id: 'manager', icon: '🎯', label: 'Mgr' },
  { id: 'collaborator', icon: '🔧', label: 'Collab' },
  { id: 'admin', icon: '⚙️', label: 'Admin' },
  { id: 'consultant', icon: '🔍', label: 'Review' }
];

function renderBatonFlow(batonState) {
  const tickets = normalizeBaton(batonState);
  if (!tickets.length) {
    return `<div class="baton-flow"><div class="baton-empty">🎯 No active tickets<br>
      <small>Baton activates when issues are assigned to a role.</small></div></div>`;
  }
  const active = tickets.filter(t =>
    !['done','cancelled','closed'].includes(t.status) && !t.closed);
  const html = active.length
    ? active.map(renderBatonRow).join('')
    : `<div class="baton-empty">✅ All active tickets completed — see Ticket Log</div>`;
  return `<div class="baton-flow">${html}</div>`;
}

function renderBatonRow(t) {
  const ai = BATON_ROLES.findIndex(x => x.id === t.activeRole);
  const resType = m => /^(qwen|llama|mistral|phi|gemma)/.test(m || '') ? 'fleet' : 'cloud';
  const steps = BATON_ROLES.map((r, i) => {
    let cls = 'baton-step';
    if (r.id === t.activeRole) cls += ' active';
    else if (ai > i) cls += ' done';
    const arrow = i < BATON_ROLES.length - 1 ? '<span class="baton-arrow">→</span>' : '';
    const isAct = r.id === t.activeRole, isDone = ai > i;
    const tip = isAct ? `${r.label} · ${resType(t.model)} · ${t.agent || '?'} · ${t.model || '?'}` : isDone ? `${r.label}: ✓ done` : `${r.label}: pending`;
    return `<span class="${cls}" title="${tip}">
      ${r.icon}<span class="baton-lbl">${r.label}</span>
    </span>${arrow}`;
  }).join('');

  const badge = batonStatusBadge(t.status);
  const agent = t.agent ? `<span class="baton-agent">🎭 ${esc(t.agent)}</span>` : '';
  const model = t.model ? `<span class="baton-model">🤖 ${esc(t.model)}</span>` : '';
  const title = t.title ? `<span class="baton-title">${esc(t.title)}</span>` : '';
  const epic = t.epic ? `<span class="baton-epic">Epic #${t.epic}</span>` : '';
  const gaps = typeof detectMissingEvents === 'function'
    ? detectMissingEvents(t.issue) : [];
  const gapWarn = gaps.length
    ? `<span class="baton-gap">⚠️ Skipped: ${gaps.join(', ')}</span>` : '';
  const staleWarn = t.stale ? '<span class="baton-gap">⏳ stale &gt;30m</span>' : '';
  const tl = renderTimeline(t.issue);
  const comment = buildCommentSnippet(t.lastComment);
  return `<div class="baton-row">
    <div class="baton-meta">
      ${epic}
      <span class="baton-issue">#${t.issue || '?'}</span>
      ${title}
      <span class="badge ${badge}">${t.status || 'idle'}</span>
      ${agent} ${model} ${gapWarn} ${staleWarn}
    </div>
    ${comment}
    <div class="baton-pipeline">${steps}</div>
    ${tl}
  </div>`;
}

function batonStatusBadge(s) {
  return ({ 'in-progress': 'active', ready: 'degraded', done: 'healthy', idle: 'unknown', review: 'degraded' })[s] || 'unknown';
}
function normalizeBaton(state) {
  if (!state) return [];
  const ok = t => t.issue && t.status !== 'closed' && !t.closed;
  return Array.isArray(state) ? state.filter(ok) : (state.issue && state.status !== 'closed' && !state.closed ? [state] : []);
}function renderTimeline(issue) {
  const tl = typeof getTicketTimeline === 'function'
    ? getTicketTimeline(issue) : [];
  if (!tl.length) return '';
  const roleDesc = { manager: 'Manager: scope defined, ACs written',
    collaborator: 'Collaborator: implementation + validation',
    admin: 'Admin: CI gates run, PR merged', consultant: 'Consultant: critique + CLOSEOUT' };
  const items = tl.map((h, i) => {
    const roleEntry = BATON_ROLES.find(x => x.id === h.role);
    const timeStr = h.ts ? new Date(h.ts).toLocaleTimeString() : '?';
    const ttl = `${roleDesc[h.role] || h.role} \u2014 at ${timeStr}`;
    return `<span class="tl-step" title="${esc(ttl)}" data-tip="tl-step">`
      + `${roleEntry?.icon || '?'} ${timeStr}</span>${i < tl.length - 1 ? ' → ' : ''}`;  }).join('');
  return `<div class="baton-timeline" title="Baton handoff history">${items}</div>`;
}

function buildCommentSnippet(lc) {
  if (!lc) return '';
  const full = esc(lc), snippet = lc.length > 80 ? esc(lc.slice(0, 80)) + '…' : full;
  return `<div class="baton-comment" title="${full}" aria-label="Last comment: ${full}">💬 ${snippet}</div>`;
}

function buildBatonState(routerLog) {
  if (!routerLog || !routerLog.length) return [];
  const last = routerLog[0];
  const roleMap = { router: 'manager', implementer: 'collaborator', quick: 'admin' };
  return [{ activeRole: roleMap[last.agent] || 'manager', issue: last.task?.match(/#(\d+)/)?.[1] || null, status: 'in-progress' }];
}