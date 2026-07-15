// Anneal Queue Panel — self-registering renderer for Epic #1308 AC9

const ANNEAL_WINDOW_DAY = Number('86400000');
const ANNEAL_WINDOW_WEEK = Number('604800000');
const WORKER_AWARENESS_EPIC = '#1436';

async function fetchAnnealQueueData() {
  const response = await fetch('/api/anneal/queue');
  if (!response.ok) throw new Error('anneal queue unavailable');
  return response.json();
}

function summarizeAnneal(events) {
  const nowMs = Date.now();
  const base = { tier1_24h: 0, tier2_24h: 0, tier3_24h: 0, tier1_7d: 0, tier2_7d: 0, tier3_7d: 0, kill: 0, pivot_ok: 0, pivot_fail: 0, top: {} };
  events.forEach((item) => {
    const age = nowMs - Date.parse(item.timestamp || 0);
    const tier = Number(item.tier || '0');
    if (age <= ANNEAL_WINDOW_WEEK) base[`tier${tier}_7d`] = (base[`tier${tier}_7d`] || 0) + 1;
    if (age <= ANNEAL_WINDOW_DAY) base[`tier${tier}_24h`] = (base[`tier${tier}_24h`] || 0) + 1;
    if (String(item.pattern_id || '').startsWith('kill-switch-')) base.kill += 1;
    if (item.pattern_id === 'pivot-success') base.pivot_ok += 1;
    if (item.pattern_id === 'pivot-failure') base.pivot_fail += 1;
    const key = item.pattern_id || 'unknown';
    base.top[key] = (base.top[key] || 0) + 1;
  });
  const topPatterns = Object.entries(base.top).sort((left, right) => right[1] - left[1]).slice(0, Number('5'));
  return { ...base, topPatterns };
}

function summarizeWorkerAwareness(pendingConfirmation) {
  // D-1436-03: count Tier-2 candidates awaiting worker confirmation.
  const list = pendingConfirmation || [];
  const pending = list.filter((entry) => entry.status === 'pending-confirmation');
  const confirmed = list.filter((entry) => entry.status === 'confirmed');
  return {
    pending_count: pending.length,
    confirmed_count: confirmed.length,
    top: pending.slice(0, Number('3')).map((entry) => ({
      pattern_id: entry.pattern_id, severity: entry.severity,
      proposal_id: entry.proposal_id,
    })),
  };
}

function renderAnnealQueuePanel(payload) {
  const stats = summarizeAnneal(payload.events || []);
  const awareness = summarizeWorkerAwareness(payload.pendingConfirmation || []);
  const topRows = stats.topPatterns.map((entry) => `<li><span>${entry[0]}</span><strong>${entry[1]}</strong></li>`).join('');
  const awarenessRows = awareness.top.length
    ? awareness.top.map((entry) => `<li><span>${entry.pattern_id} (${entry.severity})</span><strong>${entry.proposal_id.slice(0, 24)}</strong></li>`).join('')
    : '<li><span>none</span><strong>0</strong></li>';
  return `<section class="anneal-queue-panel"><div class="aq-grid">
    <article><h3>Tiers (24h / 7d)</h3><p>T1 ${stats.tier1_24h}/${stats.tier1_7d}</p><p>T2 ${stats.tier2_24h}/${stats.tier2_7d}</p><p>T3 ${stats.tier3_24h}/${stats.tier3_7d}</p></article>
    <article><h3>Kill-switch</h3><p>${stats.kill} trips (7d)</p></article>
    <article><h3>Pivot</h3><p>success ${stats.pivot_ok}</p><p>failure ${stats.pivot_fail}</p></article>
    <article><h3>Top patterns</h3><ol>${topRows || '<li><span>none</span><strong>0</strong></li>'}</ol></article>
    <article class="aq-awareness"><h3>Worker-awareness pending (${WORKER_AWARENESS_EPIC})</h3><p>pending ${awareness.pending_count} · confirmed ${awareness.confirmed_count}</p><ol>${awarenessRows}</ol></article>
  </div></section>`;
}

async function refreshAnnealQueue(targetElement) {
  try { targetElement.innerHTML = renderAnnealQueuePanel(await fetchAnnealQueueData()); }
  catch { targetElement.innerHTML = '<section class="anneal-queue-panel"><p>Anneal queue unavailable.</p></section>'; }
}

function registerAnnealQueuePanel(targetElement) {
  if (!targetElement) return;
  refreshAnnealQueue(targetElement);
  window.addEventListener('megingjord:event', async () => {
    await refreshAnnealQueue(targetElement);
    // C5: transient animation on update (honors reduced-motion)
    if (typeof window.animatePanelUpdate === 'function') {
      window.animatePanelUpdate(targetElement, 'aq-row-new');
    }
  });
}

if (typeof module !== 'undefined') module.exports = { fetchAnnealQueueData, summarizeAnneal, summarizeWorkerAwareness, renderAnnealQueuePanel, registerAnnealQueuePanel };
else Object.assign(window, { fetchAnnealQueueData, summarizeAnneal, summarizeWorkerAwareness, renderAnnealQueuePanel, registerAnnealQueuePanel });
