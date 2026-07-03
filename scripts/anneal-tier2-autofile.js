#!/usr/bin/env node
'use strict';
// tier: 2
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { classifyTier1 } = require('./anneal-severity-classifier');
const { stepGate, patternRateGate, singleFlightGate, releaseSingleFlight } = require('./anneal-kill-switch');
const { emitEvent, readEvents } = require('./anneal-event-schema');
const { gateCandidate, markConfirmed } = require('./anneal-worker-confirmation');
const { execute } = require('./github-dispatcher');
const { applyFrictionCrossTeamWeighting } = require('./friction-recurrence');

const INCIDENTS = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
const SUPPRESS_FILE = path.join(os.homedir(), '.megingjord', 'suppression-registry.json');
const TWO = Number('2');
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function loadSuppressions(nowIso) {
  if (!fs.existsSync(SUPPRESS_FILE)) return [];
  const nowMs = Date.parse(nowIso);
  const rows = readJson(SUPPRESS_FILE, []);
  const active = rows.filter((i) => Date.parse(i.expires_utc || i.suppression_until || '') > nowMs);
  if (active.length !== rows.length) fs.writeFileSync(SUPPRESS_FILE, JSON.stringify(active, null, TWO));
  return active;
}
function isSuppressed(patternId, suppressions) { return suppressions.some((i) => i.pattern_id === patternId); }
function buildCandidates(events) {
  return classifyTier1(events)
    .filter((item) => ['medium', 'high', 'critical'].includes(item.severity))
    .filter((item) => item.count >= Number('2') || item.trigger_type === 'goal-failure');
}
function emitKillSwitch(reason, patternId, sessionId, timestamp) {
  emitEvent({
    version: TWO, timestamp, tier: TWO, trigger_role: 'system', trigger_type: 'sensor-driven',
    pattern_id: `kill-switch-${reason}-${patternId || 'na'}`, severity: 'medium', evidence: [reason],
    ticket_ref: null, epic_ref: '#1308', session_id: sessionId,
    schema_compat: 'v1-readers-must-ignore-fields-not-in-v1',
  }, INCIDENTS);
}
function proposalMeta(candidate, nowIso) {
  const day = nowIso.slice(0, 10);
  const dedupe_key = `anneal:${candidate.pattern_id}:${candidate.severity}`;
  return { dedupe_key, proposal_id: `${dedupe_key}:${day}` };
}
function dedupeHit(dedupeKey) {
  try {
    const out = execFileSync('gh', ['issue', 'list', '--limit', '1', '--search', `"dedupe_key: ${dedupeKey}" in:body state:open`, '--json', 'url'], { encoding: 'utf8' });
    return (JSON.parse(out) || [])[0]?.url || '';
  } catch { return ''; }
}
function buildBody(candidate, meta, nowIso) {
  const evidence = (candidate.events || []).slice(0, 5).map((e) => e.ticket_ref || e.epic_ref || e.pattern_id).filter(Boolean);
  const ev = evidence.length ? evidence.map((e) => `- ${e}`).join('\n') : '- none-collected';
  return [
    'SELF_ANNEAL_PROPOSAL', `proposal_id: ${meta.proposal_id}`, `dedupe_key: ${meta.dedupe_key}`,
    `pattern_id: ${candidate.pattern_id}`, `severity: ${candidate.severity}`, `count_7d: ${candidate.count}`,
    'threshold: >=2 in 7d', `detected_at: ${nowIso}`, '', 'Evidence', ev, '',
    'Proposed remediation', '- run workflow-self-anneal with collected evidence',
    '- update instruction/guardrail only after review approval',
  ].join('\n');
}
function normalizeCreateResult(res) {
  if (res.provider === 'gh-cli') return (res.stdout || '').trim();
  const issue = res.result?.issue || res.result || {};
  return issue.url || issue.html_url || (issue.number ? `#${issue.number}` : 'MCP-CREATED');
}
async function maybeCreateTicket(candidate, meta, nowIso, applyFlag, opts = {}) {
  const body = buildBody(candidate, meta, nowIso);
  if (!applyFlag) return 'DRY-RUN';
  const dedupeLookup = opts.dedupeLookup || dedupeHit;
  const existing = dedupeLookup(meta.dedupe_key);
  if (existing) return existing;
  const res = await execute('create-issue', {
    title: `Anneal Proposal: ${candidate.pattern_id}`,
    body,
    labels: ['type:task', 'area:governance', 'status:backlog'],
  }, opts.dispatcherOpts || {});
  if (!res.ok) throw new Error(res.error || res.reason || 'issue create failed');
  return normalizeCreateResult(res);
}
async function processOneCandidate(candidate, ctx, out) {
  if (!stepGate(out.length + Number('1')).ok) {
    emitKillSwitch('step-counter', candidate.pattern_id, ctx.sessionId, ctx.nowIso);
    return 'break';
  }
  const gate = patternRateGate(ctx.tier2, candidate.pattern_id, Date.parse(ctx.nowIso));
  if (!gate.ok) { emitKillSwitch(gate.reason, candidate.pattern_id, ctx.sessionId, ctx.nowIso); return 'continue'; }
  const meta = proposalMeta(candidate, ctx.nowIso);
  const confirmGate = gateCandidate(candidate, meta, ctx.nowIso);
  if (!confirmGate.proceed) {
    out.push({ pattern_id: candidate.pattern_id, severity: candidate.severity, proposal_id: meta.proposal_id, dedupe_key: meta.dedupe_key, ticket_ref: `PENDING-CONFIRMATION:${confirmGate.reason}` });
    return 'continue';
  }
  const ticketRef = await maybeCreateTicket(candidate, meta, ctx.nowIso, ctx.applyFlag, {
    dedupeLookup: ctx.dedupeLookup,
    dispatcherOpts: ctx.dispatcherOpts,
  });
  emitEvent({ version: TWO, timestamp: ctx.nowIso, tier: TWO, trigger_role: 'system', trigger_type: 'sensor-driven',
    pattern_id: candidate.pattern_id, severity: candidate.severity, evidence: [`count=${candidate.count}`],
    ticket_ref: ticketRef, epic_ref: '#1308', proposal_id: meta.proposal_id, dedupe_key: meta.dedupe_key, session_id: ctx.sessionId,
    schema_compat: 'v1-readers-must-ignore-fields-not-in-v1' }, INCIDENTS);
  out.push({ pattern_id: candidate.pattern_id, severity: candidate.severity, proposal_id: meta.proposal_id, dedupe_key: meta.dedupe_key, ticket_ref: ticketRef });
  return 'next';
}

async function run(argv, opts = {}) {
  const applyFlag = argv.includes('--apply');
  const confirmIdx = argv.indexOf('--apply-confirmed');
  if (confirmIdx >= 0 && argv[confirmIdx + 1]) markConfirmed(argv[confirmIdx + 1]);
  const fixturePath = argv.includes('--fixture') ? argv[argv.indexOf('--fixture') + Number('1')] : '';
  const nowIso = new Date().toISOString();
  const suppressions = loadSuppressions(nowIso);
  const sessionId = process.env.GITHUB_RUN_ID || `local-${nowIso}`;
  const sourceEvents = fixturePath ? JSON.parse(fs.readFileSync(fixturePath, 'utf8')).events : readEvents(INCIDENTS);
  const tier1 = sourceEvents.filter((item) => item.tier === Number('1'));
  const tier2 = sourceEvents.filter((item) => item.tier === TWO);
  const flight = singleFlightGate(sessionId); if (!flight.ok) return emitKillSwitch(flight.reason, '', sessionId, nowIso);
  // #3165: friction events (tier:1) already qualify via buildCandidates; cross-team-weight
  // them so a pothole hitting >= 2 distinct teams escalates one severity level. Additive —
  // only friction candidates are touched; ordinary anneal candidates pass through unchanged.
  const candidates = applyFrictionCrossTeamWeighting(buildCandidates(tier1), tier1)
    .filter((item) => !isSuppressed(item.pattern_id, suppressions));
  const out = [];
  const ctx = { applyFlag, nowIso, sessionId, tier2, dispatcherOpts: opts.dispatcherOpts || {}, dedupeLookup: opts.dedupeLookup };
  try {
    for (const candidate of candidates) {
      const decision = await processOneCandidate(candidate, ctx, out);
      if (decision === 'break') break;
    }
  } finally {
    releaseSingleFlight();
  }
  process.stdout.write(JSON.stringify({ created: out.length, records: out }, null, TWO) + '\n');
}
if (require.main === module) {
  run(process.argv.slice(TWO)).catch((error) => { console.error(error.message); process.exit(1); });
}
module.exports = { buildCandidates, isSuppressed, proposalMeta, loadSuppressions, maybeCreateTicket, run };
