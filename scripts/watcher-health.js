#!/usr/bin/env node
'use strict';
// watcher-health.js (#3522, Epic #3520) — fleet-wide scheduled-workflow health monitor (ADR-020
// §D1/D3/D4/D5). Pure core is fixture-testable; main() does IO via gh. Reuses #2930/#3483/#546. $0.
const { execSync } = require('node:child_process');
const cb = require('./circuit-breaker');
const incidents = require('./incidents-store');
const N_CONSECUTIVE = 3, K_MAX = 10, HEARTBEAT_BUFFER_MS = 6 * 3600 * 1000;
const GH_TIMEOUT_MS = 20000, REPO_LIMIT = 200, RATE_LIMIT_RE = /rate limit|secondary|429/i;
const TRIAGE_SIGS = new Set(['failed-since-inception', 'auto-disabled-inactivity']);

// Coarse interval from cron (min hour dom mon dow): */n steps in min/hour/dom, specific dom/month
// → ~monthly, dow → weekly, else daily — so multi-day schedules are not mis-called stale (R1 fix).
const scheduleIntervalMs = (cron) => {
  const fields = String(cron || '').trim().split(/\s+/);
  if (fields.length !== 5) return 24 * 3600e3;
  const step = (field, unit) => { const m = field.match(/^\*\/(\d+)$/); return m ? +m[1] * unit : 0; };
  return step(fields[0], 60e3) || step(fields[1], 3600e3) || step(fields[2], 24 * 3600e3)
    || (fields[2] !== '*' || fields[3] !== '*' ? 30 * 24 * 3600e3 : fields[4] !== '*' ? 7 * 24 * 3600e3 : 24 * 3600e3);
};
// runs newest-first [{conclusion,created_at}] → run-based signature or null.
const classifyRuns = (runs) => {
  const concl = (runs || []).map(run => run.conclusion), K = Math.min(K_MAX, (runs || []).length);
  if (K > 0 && concl.slice(0, K).every(x => x === 'failure')) return 'failed-since-inception';
  if (concl.length > N_CONSECUTIVE && concl.slice(0, N_CONSECUTIVE).every(x => x === 'failure')
      && concl.slice(N_CONSECUTIVE).includes('success')) return 'n-consecutive-failure';
  return null;
};
// wf {state,runs,cron}; now epoch ms → single highest-severity signature or null.
const classifyWorkflow = (wf, now) => {
  if (wf.state === 'disabled_inactivity') return 'auto-disabled-inactivity';
  const runSig = classifyRuns(wf.runs); if (runSig) return runSig;
  const last = (wf.runs || [])[0], lastMs = last ? new Date(last.created_at).getTime() : 0;
  return now - lastMs > scheduleIntervalMs(wf.cron) + HEARTBEAT_BUFFER_MS ? 'stale-heartbeat' : null;
};
// Pure. repos: [{repo,archived,readable,workflows:[{name,state,cron,runs}]}]; allow {"repo/wf":reason}.
const buildReport = (repos, now, allow = {}) => {
  const findings = [], skipped = [], liveKeys = new Set();
  let reposScanned = 0, workflowsScanned = 0;
  for (const rec of repos) {
    if (rec.archived) { skipped.push({ repo: rec.repo, reason: 'archived' }); continue; }
    if (rec.readable === false) { skipped.push({ repo: rec.repo, reason: 'partial-coverage' }); continue; }
    reposScanned++;
    for (const wf of (rec.workflows || [])) {
      workflowsScanned++; const key = `${rec.repo}/${wf.name}`; liveKeys.add(key);
      const sig = classifyWorkflow(wf, now); if (!sig) continue;
      if (allow[key]) { skipped.push({ repo: rec.repo, workflow: wf.name, reason: `allow:${allow[key]}` }); continue; }
      findings.push({ repo: rec.repo, workflow: wf.name, signature: sig, triage: TRIAGE_SIGS.has(sig) });
    }
  }
  const staleAllow = Object.keys(allow).filter(k => !k.startsWith('_') && !liveKeys.has(k)).map(k => ({ key: k, reason: 'stale-allowlist' }));
  return { findings, coverage: { reposScanned, workflowsScanned, skipped, staleAllow } };
};
// ---- IO layer (not exercised by the fixture self-test) ----
const gh = (args) => execSync(`gh ${args}`, { encoding: 'utf8', timeout: GH_TIMEOUT_MS });
const shaCache = new Map(); // #3483: parse workflow YAML once per content SHA within a run.
const parseWorkflowFile = (repo, wfMeta) => {
  let raw; try { raw = JSON.parse(gh(`api repos/chf3198/${repo}/contents/${wfMeta.path}`)); } catch { return null; }
  if (shaCache.has(raw.sha)) return shaCache.get(raw.sha);
  const body = Buffer.from(raw.content || '', 'base64').toString('utf8');
  const parsed = /\bschedule\s*:/.test(body) ? { cron: (body.match(/cron:\s*['"]?([^'"\n]+)/) || [])[1] || '' } : null;
  shaCache.set(raw.sha, parsed); return parsed;
};
const fetchRepoData = (repo, breaker) => {
  if (!cb.canPass(breaker, Date.now())) return { repo, readable: false };
  try {
    const wfs = JSON.parse(gh(`api repos/chf3198/${repo}/actions/workflows --paginate`)).workflows || [];
    const workflows = [];
    for (const wfMeta of wfs) {
      const parsed = parseWorkflowFile(repo, wfMeta); if (!parsed) continue;
      let runs = [];
      try { runs = (JSON.parse(gh(`api "repos/chf3198/${repo}/actions/workflows/${wfMeta.id}/runs?per_page=10&event=schedule"`)).workflow_runs || []).map(x => ({ conclusion: x.conclusion, created_at: x.created_at })); } catch { /* keep [] → surfaces as stale-heartbeat, never silent-healthy */ }
      workflows.push({ name: wfMeta.name, state: wfMeta.state, cron: parsed.cron, runs });
    }
    cb.recordSuccess(breaker); return { repo, archived: false, readable: true, workflows };
  } catch (e) { if (RATE_LIMIT_RE.test(e.message)) cb.recordFailure(breaker, Date.now()); return { repo, readable: false }; }
};
// Pure. marker = per-(repo,workflow) key, signature-independent so a signature change updates in place.
const markerFor = (finding) => `<!-- watcher-health:${finding.repo}/${finding.workflow} -->`;
// Pure. open governance:needs-triage issues [{number,body}] + marker → existing issue number, else null.
// #3650: the marker carries GitHub search operators (':' reads as a qualifier, leading '-' in '-->' as
// negation) so a free-text `--search ${marker}` never returned the prior issue → a new ticket every run.
// A client-side exact body.includes is deterministic and operator-safe.
const findExistingTriage = (issues, marker) => {
  const hit = (issues || []).find(i => typeof i.body === 'string' && i.body.includes(marker));
  return hit ? hit.number : null;
};
const routeTriage = (finding) => {
  const marker = markerFor(finding);
  const body = `${marker}\nScheduled workflow **${finding.workflow}** in \`chf3198/${finding.repo}\` is \`${finding.signature}\` (ADR-020 §D1). Auto-filed by watcher-health (#3522).`;
  try {
    const open = JSON.parse(gh(`issue list -R chf3198/megingjord-harness --state open --label governance:needs-triage --limit ${REPO_LIMIT} --json number,body`));
    const existing = findExistingTriage(open, marker);
    if (existing) gh(`issue comment ${existing} -R chf3198/megingjord-harness --body ${JSON.stringify(body)}`);
    else gh(`issue create -R chf3198/megingjord-harness --title ${JSON.stringify(`[WATCHER-HEALTH] ${finding.repo}/${finding.workflow}: ${finding.signature}`)} --label governance:needs-triage --body ${JSON.stringify(body)}`);
  } catch (e) { incidents.append({ pattern_id: 'watcher-health-triage-fail', timestamp: new Date().toISOString(), ...finding, error: e.message }); }
};
const main = () => {
  const breaker = cb.create({ threshold: 3 });
  let allow = {}; try { allow = require('./watcher-health.allow.json'); } catch { /* none */ }
  let repos;
  try { repos = JSON.parse(gh(`repo list chf3198 --limit ${REPO_LIMIT} --json name,isArchived`)); }
  catch (e) { incidents.append({ pattern_id: 'watcher-health-enum-fail', timestamp: new Date().toISOString(), error: e.message }); process.exit(1); }
  const data = repos.map(r => r.isArchived ? { repo: r.name, archived: true } : fetchRepoData(r.name, breaker));
  const { findings, coverage } = buildReport(data, Date.now(), allow), ts = new Date().toISOString();
  for (const finding of findings) { incidents.append({ pattern_id: `watcher-health:${finding.repo}/${finding.workflow}`, timestamp: ts, ...finding }); if (finding.triage) routeTriage(finding); }
  incidents.append({ pattern_id: 'watcher-health-coverage', timestamp: ts, ...coverage, breaker: cb.status(breaker).state, findings: findings.length });
  console.log(`watcher-health: ${findings.length} finding(s), ${coverage.reposScanned} repos, ${coverage.workflowsScanned} scheduled workflows, breaker=${cb.status(breaker).state}`);
};
module.exports = { scheduleIntervalMs, classifyRuns, classifyWorkflow, buildReport, markerFor, findExistingTriage, TRIAGE_SIGS };
if (require.main === module) main();
