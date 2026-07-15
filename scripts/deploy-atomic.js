#!/usr/bin/env node
'use strict';
// deploy-atomic (#1935) — per-runtime backup + rollback markers wrapping the existing deploy.
//
// Today `scripts/deploy.sh` deploys runtimes sequentially, backs up ONLY Copilot, and has no audit
// log: a partial failure (e.g. codex ok, copilot fails) leaves the runtimes inconsistent with no
// recovery beyond `git revert`. This transaction wrapper closes that gap without rewriting deploy.sh
// (G10 — compose, don't fork): it backs up each runtime home, runs the injected deploy fn, and on any
// per-runtime failure restores that runtime's backup and appends a schema-v3 rollback marker to
// ~/.megingjord/deploy-audit.jsonl. With DEPLOY_ATOMIC=1 a partial failure rolls back ALL runtimes
// (all-or-none); unset keeps today's per-runtime behavior plus the new backup + audit safety net.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
let redact = (event) => event;
try {
  const lr = require('./log-redaction');
  redact = (event) => { const out = lr.redactEvent(event); return (out && out.event) ? out.event : out; };
} catch (_e) { /* G4 best-effort; fall back to identity */ }

function auditPath() {
  return process.env.DEPLOY_AUDIT_PATH || path.join(os.homedir(), '.megingjord', 'deploy-audit.jsonl');
}

function emitMarker(row, opts = {}) {
  const file = opts.auditPath || auditPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const event = redact({ ts: opts.ts || new Date().toISOString(), version: 3, service: 'deploy-atomic',
    env: 'local', event: row.event, runtime: row.runtime, result: row.result,
    backup_path: row.backup_path || null, sha: row.sha || null });
  fs.appendFileSync(file, JSON.stringify(event) + '\n');
  return event;
}

function backupRuntime(home, opts = {}) {
  if (!fs.existsSync(home)) return null; // nothing deployed yet — no backup needed
  const stamp = (opts.ts || new Date().toISOString()).replace(/[:.]/g, '-');
  const backup = `${home}-deploy-backup-${stamp}`;
  fs.cpSync(home, backup, { recursive: true });
  return backup;
}

function restoreRuntime(backup, home) {
  if (!backup || !fs.existsSync(backup)) return false;
  fs.rmSync(home, { recursive: true, force: true });
  fs.cpSync(backup, home, { recursive: true });
  return true;
}

// runtimes: [{ name, home }]; deployFn(runtime) deploys one runtime and THROWS on failure.
async function runAtomicDeploy(runtimes, deployFn, opts = {}) {
  const atomic = opts.atomic !== undefined ? opts.atomic : process.env.DEPLOY_ATOMIC === '1';
  const succeeded = [];
  const results = [];
  for (const runtime of runtimes) {
    const backup = backupRuntime(runtime.home, opts);
    try {
      await deployFn(runtime);
      emitMarker({ event: 'deploy', runtime: runtime.name, result: 'success', backup_path: backup }, opts);
      results.push({ runtime: runtime.name, result: 'success', backup });
      succeeded.push({ runtime, backup });
    } catch (err) {
      restoreRuntime(backup, runtime.home);
      emitMarker({ event: 'rollback', runtime: runtime.name, result: 'restored', backup_path: backup }, opts);
      results.push({ runtime: runtime.name, result: 'rollback', backup,
        error: String((err && err.message) || err) });
      if (atomic) {
        for (const prev of succeeded) {
          restoreRuntime(prev.backup, prev.runtime.home);
          emitMarker({ event: 'rollback', runtime: prev.runtime.name, result: 'restored-atomic',
            backup_path: prev.backup }, opts);
          results.push({ runtime: prev.runtime.name, result: 'rollback-atomic', backup: prev.backup });
        }
        return { ok: false, atomic: true, results };
      }
    }
  }
  return { ok: results.every((r) => r.result === 'success'), atomic, results };
}

module.exports = { runAtomicDeploy, backupRuntime, restoreRuntime, emitMarker, auditPath };

if (require.main === module) {
  // Real usage: wrap `scripts/deploy.sh --target <rt> --apply` per runtime under the transaction.
  const { spawnSync } = require('node:child_process');
  const root = path.resolve(__dirname, '..', '..');
  const home = os.homedir();
  const runtimes = [
    { name: 'copilot', home: path.join(home, '.copilot') },
    { name: 'codex', home: path.join(home, '.codex') },
    { name: 'claude', home: path.join(home, '.claude') },
    { name: 'antigravity', home: path.join(home, '.antigravity') },
    { name: 'cursor', home: path.join(home, '.cursor') },
  ];
  const deployFn = (rt) => {
    const res = spawnSync('bash', [path.join(root, 'scripts', 'deploy.sh'), '--apply', '--target', rt.name],
      { stdio: 'inherit' });
    if (res.status !== 0) throw new Error(`deploy.sh --target ${rt.name} exited ${res.status}`);
  };
  runAtomicDeploy(runtimes, deployFn).then((summary) => {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    process.exit(summary.ok ? 0 : 1);
  });
}
