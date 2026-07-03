/* global addActivity, addRouterLogEntry */
let _lastEventTs = null;
const _batonTickets = {}, _batonHistory = {};
const _ticketLog = {};
const CLOSED_STATUSES = new Set(['done', 'cancelled']);
const ACTIVE_STATUSES = new Set(['in-progress', 'review', 'testing', 'ready-for-testing']);
const STATUS_ROLE_MAP = {
  backlog: null, todo: 'manager', ready: 'manager', 'in-progress': 'collaborator',
  'ready-for-testing': 'admin', testing: 'admin',
  'passed-testing': 'admin', review: 'consultant', done: 'consultant', cancelled: null,
};
function normalizeStatus(e, prev) {
  return e.status || (e.type === 'ticket:created' ? 'backlog' : null) || prev?.status || 'backlog';
}
function normalizeRole(e, status, prev) {
  return e.role || STATUS_ROLE_MAP[status] || prev?.activeRole || null;
}

async function fetchEvents(since) {
  const url = since ? '/api/events?since=' + encodeURIComponent(since) : '/api/events';
  try { const response = await fetch(url); return response.ok ? await response.json() : []; }
  catch { return []; }
}

function eventToActivity(e) {
  const map = {
    'baton:': 'baton', 'ticket:created': 'ticket',
    'ticket:status': 'ticket', 'ticket:role': 'role',
    'git:branch': 'branch', 'git:pr': 'pr',
    'git:commit': 'commit', 'git:merge': 'merge',
    'deploy:': 'deploy', 'test:': 'test'
  };
  const key = Object.keys(map).find(k => e.type.startsWith(k));
  const type = key ? map[key] : 'system';
  const msg = e.agent
    ? `[${e.agent}] ${e.detail || e.type}`
    : (e.detail || e.type);
  return { type, message: msg, detail: e.issue ? `#${e.issue}` : '' };
}

function mergeBatonEvents(events) {
  const now = Date.now();
  for (const e of events) {
    if (!e.issue) continue;
    const prev = _ticketLog[e.issue] || _batonTickets[e.issue];
    const status = normalizeStatus(e, prev);
    const role = normalizeRole(e, status, prev);
    const base = { issue: e.issue, _updated: now,
      title: e.title || prev?.title || '',
      epic: e.epic || prev?.epic || null,
      agent: e.agent || prev?.agent || '',
      model: e.model || prev?.model || '' };
    _ticketLog[e.issue] = { ...base, status, activeRole: role };
    if (CLOSED_STATUSES.has(status) || !ACTIVE_STATUSES.has(status) || !role) {
      delete _batonTickets[e.issue];
      continue;
    }
    _batonTickets[e.issue] = { ...base, activeRole: role, status };
    if (!_batonHistory[e.issue]) _batonHistory[e.issue] = [];
    if (role && (!_batonHistory[e.issue].length || _batonHistory[e.issue][_batonHistory[e.issue].length - 1].role !== role)) {
      _batonHistory[e.issue].push({ role, ts: e.ts || new Date(now).toISOString() });
    }
  }
  return Object.values(_batonTickets).sort((a, b) => (b.issue || 0) - (a.issue || 0));
}

const _STALE_MS = 30 * 60 * 1000;
function pruneClosedFromGitHub(issues) {
  (issues||[]).filter(i=>/^(CLOSED|MERGED)$/i.test(i.state)).forEach(i=>delete _batonTickets[String(i.number)]);
}
function getBatonState() {
  const now = Date.now();
  return Object.values(_batonTickets)
    .filter(t => ACTIVE_STATUSES.has(t.status) && !CLOSED_STATUSES.has(t.status))
    .map(t => ({ ...t, stale: now - t._updated > _STALE_MS }));
}
function getTicketLog() {
  return Object.values(_ticketLog).sort((a, b) => (b.issue || 0) - (a.issue || 0));
}
function getTicketTimeline(issue) { return _batonHistory[issue] || []; }

function detectMissingEvents(issue) {
  const exp = ['manager','collaborator','admin','consultant'];
  const roles = (_batonHistory[issue]||[]).map(h=>h.role);
  return roles.flatMap((r,i) => i>=roles.length-1 ? [] :
    exp.slice(exp.indexOf(r)+1, exp.indexOf(roles[i+1])));
}

async function pollEventBus(activityLog) {
  const events = await fetchEvents(_lastEventTs);
  if (!events.length) return getBatonState();
  _lastEventTs = events[events.length - 1].ts;
  for (const e of events) {
    const activity = eventToActivity(e);
    addActivity(activityLog, activity.type, activity.message, activity.detail);
    if (e.agent && e.model) addRouterLogEntry(e.agent, e.model, e.detail || e.type);
  }
  return mergeBatonEvents(events);
}
if(typeof module!=="undefined")module.exports={fetchEvents,eventToActivity,mergeBatonEvents,pruneClosedFromGitHub,getBatonState,getTicketLog,getTicketTimeline,detectMissingEvents,pollEventBus};else Object.assign(window,{fetchEvents,eventToActivity,mergeBatonEvents,pruneClosedFromGitHub,getBatonState,getTicketLog,getTicketTimeline,detectMissingEvents,pollEventBus});
