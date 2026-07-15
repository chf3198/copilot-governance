#!/usr/bin/env node
'use strict';
// Reconcile dirty + merged worktrees whose ticket is closed. Epic 3352 C3 (ticket 3358).
// Superseded pre-squash scratch = untracked build/dep artifacts ONLY. Any modified tracked file or
// untracked source is treated as NOVEL and routed to rescue — never auto-removed. Removal of the
// superseded-only class uses `git clean` + `git worktree remove` (NEVER --force). Default dry-run.
const { execFileSync } = require('child_process');
const { inventory } = require('./worktree-inventory');
const { emitV3 } = require('./event-schema-v3');
const { redactEvent } = require('./log-redaction');

// Conservative allow-list: only these untracked path classes count as superseded scratch.
const SUPERSEDED_PATTERNS = [
  /(^|\/)node_modules\//, /(^|\/)dist\//, /(^|\/)build\//, /(^|\/)coverage\//,
  /(^|\/)test-results\//, /(^|\/)\.cache\//, /(^|\/)tmp\//, /(^|\/)\.dashboard\//,
  /(^|\/)\.log4brains\//, /\.log$/, /\.tmp$/, /(^|\/)\.DS_Store$/,
];

function isSupersededArtifact(file) {
  // ONLY untracked artifacts qualify; a modified tracked file is never superseded scratch.
  return file.untracked && SUPERSEDED_PATTERNS.some((pattern) => pattern.test(file.path));
}

function classifyFiles(files) {
  const superseded = files.filter(isSupersededArtifact);
  const novel = files.filter((file) => !isSupersededArtifact(file));
  return { superseded, novel, decision: novel.length ? 'rescue' : 'safe-remove' };
}

function listDirtyFiles(worktreePath, runGit) {
  const raw = runGit(['-C', worktreePath, 'status', '--porcelain', '--untracked-files=all']) || '';
  return raw.split('\n').filter(Boolean).map((line) => ({
    untracked: line.startsWith('??'), path: line.slice(3).trim(),
  }));
}

function defaultRunGit(args) {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

function defaultRemove(worktreePath, runGit) {
  // discard superseded untracked scratch, then remove WITHOUT --force (clean tree → no force needed).
  runGit(['-C', worktreePath, 'clean', '-fdx']);
  try {
    execFileSync('git', ['worktree', 'remove', worktreePath], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
    return { ok: true, exitCode: 0, stderr: '' };
  } catch (err) { return { ok: false, exitCode: err.status || 1, stderr: String(err.stderr || err.message || '').trim() }; }
}

function auditRecord(candidate, classified, result, timestamp) {
  return redactEvent({
    version: '3', ts: timestamp, service: 'worktree-quarantine-reconcile', env: 'local',
    event: result.ok ? 'quarantine-reconciled-removed' : 'quarantine-reconcile-refused',
    worktree_path: candidate.path, branch: candidate.branch || null, ticket: candidate.ticket || null,
    superseded_count: classified.superseded.length, novel_count: classified.novel.length,
    decision: result.ok ? 'removed-superseded-scratch' : 'refused',
    remove_exit_code: result.exitCode,
    operator_alias: process.env.MEGINGJORD_OPERATOR_ALIAS || `${process.env.HAMR_TEAM || 'unknown'}:admin`,
    _summary: `quarantine reconcile ${result.ok ? 'removed' : 'refused'} ${candidate.branch || candidate.path}`,
  }).event;
}

function reconcile(opts = {}) {
  const candidates = opts.candidates || buildCandidates(opts);
  const confirm = opts.confirm === true;
  const runGit = opts.runGit || defaultRunGit;
  const remove = opts.remove || ((path) => defaultRemove(path, runGit));
  const emit = opts.emit || ((record) => { try { emitV3(record, opts.auditFile || AUDIT_FILE); } catch (_) { /* best-effort */ } });
  const clock = opts.now || (() => new Date().toISOString());
  const results = [];
  for (const candidate of candidates) {
    if (!(candidate.mergedToMainDirty && candidate.ticketClosed)) {
      results.push({ ...candidate, decision: 'skip-not-eligible' }); continue;
    }
    const classified = classifyFiles(candidate.files || []);
    if (classified.decision === 'rescue') {
      results.push({ ...candidate, ...classified, decision: 'rescue-novel-work' }); continue;
    }
    if (!confirm) { results.push({ ...candidate, ...classified, decision: 'safe-remove-pending-confirm' }); continue; }
    // fault-injection resilience: a throwing remover becomes a captured refusal, never a crash.
    let result;
    try { result = remove(candidate.path); }
    catch (err) { result = { ok: false, exitCode: err.status || 1, stderr: String(err.message || err).trim() }; }
    emit(auditRecord(candidate, classified, result, clock()));
    results.push({ ...candidate, ...classified, decision: result.ok ? 'removed' : 'refused', exitCode: result.exitCode });
  }
  return results;
}

const path = require('path');
const AUDIT_FILE = process.env.MEGINGJORD_TEARDOWN_AUDIT
  || path.join(process.env.HOME || '.', 'devenv-ops', 'dashboard', 'events.jsonl');

function buildCandidates(opts = {}) {
  const runGit = opts.runGit || defaultRunGit;
  const ticketClosed = opts.ticketClosed || defaultTicketClosed;
  const report = opts.inventory || inventory(undefined, { runGh: require('./worktree-inventory').gh });
  return report.worktrees
    .filter((worktree) => worktree.mergedToMainDirty === true && worktree.ticket)
    .map((worktree) => ({
      path: worktree.path, branch: worktree.branch, ticket: worktree.ticket,
      mergedToMainDirty: true, ticketClosed: ticketClosed(worktree.ticket),
      files: listDirtyFiles(worktree.path, runGit),
    }));
}

function defaultTicketClosed(ticket) {
  try {
    const out = execFileSync('gh', ['issue', 'view', String(ticket), '--json', 'state', '-q', '.state'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out === 'CLOSED';
  } catch { return false; }
}

function run(argv = process.argv.slice(2)) {
  const results = reconcile({ confirm: argv.includes('--apply') });
  if (argv.includes('--json')) { process.stdout.write(`${JSON.stringify(results, null, 2)}\n`); return results; }
  for (const item of results) {
    process.stdout.write(`${item.decision.padEnd(28)} ${item.branch || item.path} ` +
      `(superseded=${(item.superseded || []).length} novel=${(item.novel || []).length})\n`);
  }
  return results;
}

if (require.main === module) run();

module.exports = { reconcile, classifyFiles, isSupersededArtifact, listDirtyFiles, buildCandidates, auditRecord, AUDIT_FILE };
