#!/usr/bin/env node
'use strict';
// Actuate post-merge/post-close worktree teardown. Epic 3352 keystone (ticket 3357).
// Executes `git worktree remove` (NEVER --force) for cleanupState 'remove' worktrees,
// captures the dirty-guard output, and emits a redacted audit record. Default dry-run.
const { execFileSync } = require('child_process');
const path = require('path');
const { plan } = require('./worktree-cleanup-plan');
const { emitV3 } = require('./event-schema-v3');
const { redactEvent } = require('./log-redaction');

const AUDIT_FILE = process.env.MEGINGJORD_TEARDOWN_AUDIT
  || path.join(process.env.HOME || '.', 'devenv-ops', 'dashboard', 'events.jsonl');

function operatorAlias() {
  const team = process.env.HAMR_TEAM || process.env.MEGINGJORD_TEAM || 'unknown';
  return process.env.MEGINGJORD_OPERATOR_ALIAS || `${team}:admin`;
}

// NEVER --force: git's own dirty-guard is the authoritative final teardown gate.
function defaultRunRemove(worktreePath) {
  try {
    execFileSync('git', ['worktree', 'remove', worktreePath],
      { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
    return { ok: true, exitCode: 0, stderr: '' };
  } catch (err) {
    return { ok: false, exitCode: err.status || 1, stderr: String(err.stderr || err.message || '').trim() };
  }
}

function auditRecord(worktree, result, timestamp) {
  return redactEvent({
    version: '3', ts: timestamp, service: 'worktree-teardown', env: 'local',
    event: result.ok ? 'worktree-teardown-removed' : 'worktree-teardown-refused',
    worktree_path: worktree.path, branch: worktree.branch || null, ticket: worktree.ticket || null,
    merge_evidence: worktree.squashMerged ? 'squash-detected' : 'ancestor',
    operator_alias: operatorAlias(),
    decision: result.ok ? 'removed' : 'refused-by-dirty-guard',
    remove_exit_code: result.exitCode, remove_stderr: result.stderr,
    _summary: `worktree teardown ${result.ok ? 'removed' : 'refused'} ${worktree.branch || worktree.path}`,
  }).event;
}

function defaultEmit(record) {
  try { emitV3(record, AUDIT_FILE); } catch (_) { /* observability is best-effort, never blocks teardown */ }
}

function actuate(opts = {}) {
  const report = opts.plan || plan();
  const apply = opts.apply === true;
  const runRemove = opts.runRemove || defaultRunRemove;
  const emit = opts.emit || defaultEmit;
  const clock = opts.now || (() => new Date().toISOString());
  const currentPath = opts.currentPath || process.cwd();
  const removable = (report.worktrees || []).filter(worktree =>
    worktree.cleanupState === 'remove' && worktree.path !== currentPath && worktree.branch !== 'main');
  const removed = [];
  const refused = [];
  const skipped = [];
  for (const worktree of removable) {
    if (!apply) { skipped.push({ path: worktree.path, branch: worktree.branch, reason: 'dry-run' }); continue; }
    // fault-injection resilience: a throwing remover becomes a captured refusal, never a crash.
    let result;
    try { result = runRemove(worktree.path); }
    catch (err) { result = { ok: false, exitCode: err.status || 1, stderr: String(err.message || err).trim() }; }
    emit(auditRecord(worktree, result, clock()));
    const bucket = result.ok ? removed : refused;
    bucket.push({ path: worktree.path, branch: worktree.branch, exitCode: result.exitCode });
  }
  return { apply, removed, refused, skipped, total: removable.length };
}

function run(argv = process.argv.slice(2)) {
  const result = actuate({ apply: argv.includes('--apply') });
  if (argv.includes('--json')) { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return result; }
  const mode = result.apply ? 'APPLY' : 'DRY-RUN';
  process.stdout.write(`worktree-teardown [${mode}]: removable=${result.total} ` +
    `removed=${result.removed.length} refused=${result.refused.length} skipped=${result.skipped.length}\n`);
  for (const item of result.skipped) process.stdout.write(`  would remove ${item.branch} (${item.path})\n`);
  for (const item of result.refused) process.stdout.write(`  REFUSED ${item.branch} (exit ${item.exitCode}) — dirty-guard held\n`);
  return result;
}

if (require.main === module) run();

module.exports = { actuate, auditRecord, operatorAlias, defaultRunRemove, AUDIT_FILE };
