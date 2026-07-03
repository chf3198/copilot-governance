// tier: 2
// Phase 3 / #785 — per-turn state offload client
// Reads .dashboard/capabilities.json; uses Cloudflare Worker if available,
// falls back to direct GitHub `gh` CLI on cache miss / no-substrate / error.
// CRITICAL: GitHub is canonical; the Worker is only a cache.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FETCH_TIMEOUT_MS = 4000;
const GH_CLI_TIMEOUT_MS = 8000;
const STALE_TTL_MS = 60 * 1000;
const MANIFEST_PATH = path.join(process.cwd(), '.dashboard', 'capabilities.json');

let _bannerShown = false;
function _banner(msg) {
  if (_bannerShown) return;
  _bannerShown = true;
  process.stderr.write(`ℹ️  state-offload: ${msg}\n`);
}

function _capability() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch { return null; }
}

function _workerUrl() {
  const cap = _capability();
  if (!cap?.cloudflare?.worker?.available) return null;
  return process.env.CLOUDFLARE_WORKER_URL || null;
}

async function _cacheGet(pathSuffix) {
  const url = _workerUrl();
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${url}${pathSuffix}`, { signal: controller.signal });
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function _gh(args) {
  try {
    return execSync(`gh ${args}`, { encoding: 'utf8', timeout: GH_CLI_TIMEOUT_MS }).trim();
  } catch { return null; }
}

async function getBatonState(issueN) {
  const cached = await _cacheGet(`/baton/${issueN}`);
  if (cached?.value) return { value: cached.value, source: 'cache', stale: !!cached.stale };
  const labels = _gh(`issue view ${issueN} --json labels --jq '[.labels[].name]'`);
  if (!labels) { _banner('GitHub fallback failed'); return null; }
  return { value: { labels: JSON.parse(labels) }, source: 'github', stale: false };
}

async function getAssignee(issueN) {
  const cached = await _cacheGet(`/assignee/${issueN}`);
  if (cached?.value) return { value: cached.value, source: 'cache', stale: !!cached.stale };
  const out = _gh(`issue view ${issueN} --json assignees --jq '[.assignees[].login]'`);
  return { value: out ? JSON.parse(out) : [], source: 'github', stale: false };
}

async function getBranchPointer(repoPath) {
  const cached = await _cacheGet(`/branch/${encodeURIComponent(repoPath || '.')}`);
  if (cached?.value) return { value: cached.value, source: 'cache', stale: !!cached.stale };
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath || '.', encoding: 'utf8' }).trim();
    const sha = execSync('git rev-parse HEAD', { cwd: repoPath || '.', encoding: 'utf8' }).trim();
    return { value: { branch, sha }, source: 'github', stale: false };
  } catch { return null; }
}

async function getRecentActivity(sinceISO) {
  const cached = await _cacheGet(`/activity/${encodeURIComponent(sinceISO)}`);
  if (cached?.value) return { value: cached.value, source: 'cache', stale: !!cached.stale };
  const eventsFile = path.join(process.cwd(), '.dashboard', 'events.jsonl');
  if (!fs.existsSync(eventsFile)) return { value: [], source: 'local', stale: false };
  const lines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean);
  const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const filtered = events.filter(e => e.ts && e.ts >= sinceISO);
  return { value: filtered.slice(-50), source: 'local', stale: false };
}

module.exports = {
  getBatonState, getAssignee, getBranchPointer, getRecentActivity,
  _capability, _workerUrl, STALE_TTL_MS,
};

if (require.main === module) {
  const [, , cmd, arg] = process.argv;
  const fns = { baton: getBatonState, assignee: getAssignee, branch: getBranchPointer, activity: getRecentActivity };
  if (!fns[cmd]) { process.stderr.write('Usage: state-offload-client.js <baton|assignee|branch|activity> <arg>\n'); process.exit(1); }
  fns[cmd](arg).then(r => process.stdout.write(JSON.stringify(r, null, 2) + '\n'));
}
