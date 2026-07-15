// Event Reader — reads .dashboard/events.jsonl for dashboard API
// Companion to emit-event.js; used by dashboard-server /api/events

const fs = require('fs');
const path = require('path');

const EVENTS_DIR = path.resolve(__dirname, '..', '..', '.dashboard');
const EVENTS_FILE = path.join(EVENTS_DIR, 'events.jsonl');
const MAX_EVENTS = 100;

function readEvents(urlPath) {
  const since = urlPath.includes('since=')
    ? decodeURIComponent(urlPath.split('since=')[1].split('&')[0])
    : null;
  if (!fs.existsSync(EVENTS_FILE)) return [];
  const raw = fs.readFileSync(EVENTS_FILE, 'utf-8').trim();
  if (!raw) return [];
  const events = [];
  for (const line of raw.split('\n')) {
    try { events.push(JSON.parse(line)); } catch { /* skip */ }
  }
  if (since) return events.filter(e => e.ts > since);
  return events.slice(-MAX_EVENTS);
}

module.exports = { readEvents };
