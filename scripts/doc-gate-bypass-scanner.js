'use strict';
// Refs #2717 (G8 observability), #2718 (hardening: pagination, dedup, warn-and-exit)
// doc-gate-bypass-scanner.js — detects [skip-doc-gate] in merged PRs, emits incidents.
// Invocation contract: runs as git post-merge hook on operator machine (NOT CI runner).
// Bypass events are eventually consistent (lag = time since last hook run). #2718 AC.

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const INCIDENTS_PATH = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
const STATE_PATH = path.join(os.homedir(), '.megingjord', 'doc-gate-bypass-seen.json');
const BYPASS_RE = /\[skip-doc-gate\]/i;
const NA_INCIDENT_RE = /doc-coverage:\s*\n(?:.*\n)*?.*\bN\/A\b.*\s+([\w-]+)/gi;
const GH_TIMEOUT_MS = 20000;

function loadSeen() { try { return new Set(JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))); } catch (_) { return new Set(); } }
function saveSeen(seen) { fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true }); fs.writeFileSync(STATE_PATH, JSON.stringify([...seen])); }

function appendIncident(ev) { fs.mkdirSync(path.dirname(INCIDENTS_PATH), { recursive: true }); fs.appendFileSync(INCIDENTS_PATH, JSON.stringify(ev) + '\n'); }
function makeEvent(patternId, evidence, severity) { return { version: 2, timestamp: new Date().toISOString(), tier: 1, trigger_type: 'doc-coverage-bypass', pattern_id: patternId, severity: severity || 'medium', evidence, schema_compat: 'v1-readers-must-ignore-fields-not-in-v1' }; }

function fetchMergedPRs(repo, limit) {
  // Paginated fetch — avoids --limit 20 silent drop (#2718 AC)
  const perPage = Math.min(limit || 50, 50); let page = 1; const all = [];
  while (true) {
    const spawnResult = spawnSync('gh', ['pr', 'list', '--state', 'merged', '--search',
      'skip-doc-gate in:body', '--json', 'number,body,headRefName,mergedAt',
      '--limit', String(perPage), '--skip-header',
      ...(repo ? ['--repo', repo] : [])], { timeout: GH_TIMEOUT_MS, encoding: 'utf8' });
    if (spawnResult.status !== 0) {
      process.stderr.write(`[doc-gate-bypass-scanner] gh error: ${spawnResult.stderr || spawnResult.error}\n`);
      return null; // warn-and-exit contract: return null → caller skips silently
    }
    let prs; try { prs = JSON.parse(spawnResult.stdout || '[]'); } catch (_) { prs = []; }
    all.push(...prs); if (prs.length < perPage) break; page++;
    if (page > 10) break; // safety cap: max PR_FETCH_CAP
  }
  return all;
}

function scan(opts = {}) {
  const { repo, incidentsPath, statePath, dryRun } = opts;
  const iPath = incidentsPath || INCIDENTS_PATH;
  const sPath = statePath || STATE_PATH;
  const seen = loadSeen();
  const prs = fetchMergedPRs(repo);
  if (prs === null) return { emitted: 0, skipped: 0, error: 'gh-unavailable' };
  let emitted = 0; let skipped = 0;
  for (const pr of prs) {
    const key = String(pr.number);
    if (seen.has(key)) { skipped++; continue; } // dedup guard (Refs C7)
    const body = pr.body || '';
    if (!BYPASS_RE.test(body)) { seen.add(key); continue; }
    const ev = makeEvent('doc-gate-skip-doc-gate',
      [`pr_number=${pr.number}`, `branch=${pr.headRefName || ''}`,
       `merged_at=${pr.mergedAt || ''}`]);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(iPath), { recursive: true });
      fs.appendFileSync(iPath, JSON.stringify(ev) + '\n');
    }
    seen.add(key); emitted++;
  }
  if (!dryRun) saveSeen(seen);
  return { emitted, skipped, prs: prs.length };
}

// Emit N/A declaration event (called from pre-push hook, not CI runner)
function emitNaEvent(surface, reason, ticketNumber, opts = {}) {
  const ev = makeEvent(`doc-gate-na-${reason}`,
    [`surface=${surface}`, `ticket=${ticketNumber || 'unknown'}`], 'low');
  if (!opts.dryRun) appendIncident(ev);
  return ev;
}

// Emit invalid-N/A event (called from pre-push hook, not CI runner)
function emitInvalidNaEvent(surface, reason, ticketNumber, opts = {}) {
  const ev = makeEvent(`doc-gate-invalid-na-${reason}`,
    [`surface=${surface}`, `ticket=${ticketNumber || 'unknown'}`], 'medium');
  if (!opts.dryRun) appendIncident(ev);
  return ev;
}

if (require.main === module) {
  const result = scan({ repo: process.env.GITHUB_REPO, dryRun: process.argv.includes('--dry-run') });
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.error ? 1 : 0);
}

module.exports = { scan, emitNaEvent, emitInvalidNaEvent, fetchMergedPRs, makeEvent };
