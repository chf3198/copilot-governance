'use strict';
// epic-dormancy-detector — pure-function helpers consumed by
// .github/workflows/epic-state-sync.yml. Detects whether an Epic at
// status:in-progress should auto-transition to status:dormant per #1342.

const DEFAULT_DAYS = Number(process.env.EPIC_DORMANT_AFTER_DAYS || 7);
const DAY_MS = 86_400_000;
const ACTIVE_MARKER_RE = /(^|\n)\s*EPIC_ACTIVE:\s*[^\n]+/i;

function daysSince(iso, nowMs) {
  if (!iso) return Infinity;
  return Math.floor(((nowMs || Date.now()) - Date.parse(iso)) / DAY_MS);
}

function hasRecentActiveMarker(comments, days) {
  const window = days || DEFAULT_DAYS;
  const cutoff = Date.now() - window * DAY_MS;
  return (comments || []).some(c =>
    Date.parse(c.created_at || c.updated_at || 0) >= cutoff
    && ACTIVE_MARKER_RE.test(c.body || '')
  );
}

function hasActiveChild(children) {
  return (children || []).some(child =>
    child.state === 'open'
    && (child.labels || []).some(label => label === 'status:in-progress')
  );
}

function hasRecentPrActivity(prActivity, days) {
  const window = days || DEFAULT_DAYS;
  const cutoff = Date.now() - window * DAY_MS;
  return (prActivity || []).some(event =>
    Date.parse(event.timestamp || 0) >= cutoff
  );
}

function shouldGoDormant(input) {
  const window = input.dormantAfterDays || DEFAULT_DAYS;
  const status = (input.labels || []).find(l => l === 'status:in-progress');
  if (!status) return { dormant: false, reason: 'not-in-progress' };
  if (hasActiveChild(input.children)) return { dormant: false, reason: 'active-child' };
  if (hasRecentPrActivity(input.prActivity, window)) return { dormant: false, reason: 'recent-pr-activity' };
  if (hasRecentActiveMarker(input.comments, window)) return { dormant: false, reason: 'epic-active-marker' };
  return { dormant: true, reason: 'idle', window_days: window };
}

function shouldReactivate(input) {
  if (!(input.labels || []).includes('status:dormant')) {
    return { reactivate: false, reason: 'not-dormant' };
  }
  if (hasActiveChild(input.children)) {
    return { reactivate: true, reason: 'child-became-active' };
  }
  // Recent PR activity (any age — caller filters to "since dormancy")
  if ((input.prActivity || []).length > 0) {
    return { reactivate: true, reason: 'new-pr-opened' };
  }
  return { reactivate: false, reason: 'still-idle' };
}

function autoPauseComment(epicNumber, reason, nextTrigger) {
  return [
    '## EPIC_AUTO_PAUSE',
    '',
    `Epic #${epicNumber} auto-transitioned \`status:in-progress\` → \`status:dormant\` per #1342.`,
    '',
    `Trigger reason: ${reason}.`,
    `Implicit resume trigger: ${nextTrigger || 'a child ticket moves to status:in-progress OR a new PR opens against a child'}.`,
    '',
    'Manager: post `EPIC_ACTIVE: <reason>` to override on the next cycle if implementation is genuinely in flight.',
    '',
    '_Posted by epic-state-sync workflow._',
  ].join('\n');
}

module.exports = {
  daysSince, hasRecentActiveMarker, hasActiveChild, hasRecentPrActivity,
  shouldGoDormant, shouldReactivate, autoPauseComment,
  DEFAULT_DAYS, ACTIVE_MARKER_RE,
};
