// Live Activity Feed — Agile lifecycle event log
// Shows only meaningful events, suppresses repetitive noise
/* global esc */

const MAX_ACTIVITY = 30;
const SUPPRESS_TYPES = new Set(['refresh']);
const DEDUP_WINDOW_MS = 10000;

function addActivity(log, type, message, detail) {
  if (SUPPRESS_TYPES.has(type)) return;
  // Deduplicate: skip if same message in last 10 seconds
  if (log.length && log[0].message === message) {
    const prev = log[0]._ts || 0;
    if (Date.now() - prev < DEDUP_WINDOW_MS) return;
  }
  log.unshift({
    time: new Date().toLocaleTimeString(),
    type: type || 'info',
    message: message || '',
    detail: detail || '',
    _ts: Date.now()
  });
  if (log.length > MAX_ACTIVITY) log.length = MAX_ACTIVITY;
}

function renderActivityFeed(log) {
  if (!log || !log.length) {
    return `<div class="activity-empty">
      <p>No activity yet. Events appear on refresh,
      test runs, and Agile role transitions.</p></div>`;
  }
  const rows = log.map(e => {
    const icon = activityIcon(e.type);
    return `<div class="activity-row ${e.type}">
      <span class="activity-time">${esc(e.time)}</span>
      <span class="activity-icon">${icon}</span>
      <span class="activity-msg">${esc(e.message)}</span>
      ${e.detail ? `<span class="activity-detail">${esc(e.detail)}</span>` : ''}
    </div>`;
  }).join('');
  return `<div class="activity-list">${rows}</div>`;
}

function activityIcon(type) {
  const icons = {
    refresh: '↻', test: '🧪', baton: '🔄',
    router: '🛣️', system: '⚙️', error: '❌', warn: '⚠️',
    ticket: '🎫', role: '🏷️', branch: '🌿',
    pr: '🔀', commit: '📝', merge: '✅', deploy: '🚀'
  };
  return icons[type] || '📌';
}

window.addActivity = addActivity;
window.renderActivityFeed = renderActivityFeed;
