#!/usr/bin/env node
// harness-self-test-runner (#1826) — executes a single check, returns structured result.
// Pure function for testability; orchestrator wires this against the registry.
'use strict';

const { execSync } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 60000;

function runOne(check, opts = {}) {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let stdout = '', stderr = '', exitCode = 0;
  try {
    stdout = execSync(check.command, { encoding: 'utf8', timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      cwd: opts.cwd || process.cwd() });
  } catch (err) {
    stdout = err.stdout?.toString('utf8') || '';
    stderr = err.stderr?.toString('utf8') || '';
    exitCode = err.status ?? 1;
  }
  const elapsedMs = Date.now() - start;
  const passed = exitCode === 0;
  const observed = (stdout + (stderr ? `\n[stderr]\n${stderr}` : '')).trim().slice(0, 1000);
  return { passed, exitCode, elapsedMs, observed,
    diagnosis: diagnose(check, passed, observed) };
}

function diagnose(check, passed, observed) {
  if (passed) return 'pass';
  if (/ECONNREFUSED|ETIMEDOUT|fetch failed/.test(observed)) return 'network-unreachable';
  if (/permission denied|EACCES/i.test(observed)) return 'permissions-error';
  if (/no such file|ENOENT/i.test(observed)) return 'missing-file';
  return check.id === 'step0-hook-parity' && /runtime-stale/.test(observed)
    ? 'runtime-stale' : 'check-failed';
}

function isShortCircuitFailure(check, result) {
  return check.short_circuit_on_fail === true && !result.passed;
}

function runAll(checks, opts = {}) {
  const adapter = opts.adapter || 'unknown';
  const exemptForAdapter = new Set(
    (opts.exemptions?.[adapter]?.exempt_checks || []));
  const results = [];
  let shortCircuited = false;
  for (const check of checks) {
    if (exemptForAdapter.has(check.id)) {
      results.push({ check, result: { passed: true, exitCode: 0, elapsedMs: 0,
        observed: 'exempt for this adapter', diagnosis: 'adapter-exempt' } });
      continue;
    }
    if (shortCircuited) {
      results.push({ check, result: { passed: false, exitCode: null, elapsedMs: 0,
        observed: 'skipped: short-circuit triggered by earlier check',
        diagnosis: 'skipped-short-circuit' } });
      continue;
    }
    const result = runOne(check, opts);
    results.push({ check, result });
    if (isShortCircuitFailure(check, result)) shortCircuited = true;
  }
  return results;
}

module.exports = { runOne, runAll, diagnose, isShortCircuitFailure, DEFAULT_TIMEOUT_MS };
