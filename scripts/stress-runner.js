#!/usr/bin/env node
// stress-runner (#1871) — orchestrates all stress specs, captures perf metrics,
// emits OTel GenAI events to incidents.jsonl. Integrates with harness:self-test.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');
const { redactEvent } = require('./log-redaction');

const INCIDENTS_FILE = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
const SERVICE = 'megingjord-stress-runner';

const EPIC_WORKTREE = 1854;
const EPIC_ANNEAL = 1855;
const EPIC_REBASE = 1827;
const EPIC_ROLE_BATON = 1876;
const SUITE_TIMEOUT_MS = 120000;
const OUTPUT_TRUNCATE = 500;
const SUITES = [
  { id: 'worktree-isolation', spec: 'tests/stress-worktree-isolation.spec.js', epic: EPIC_WORKTREE },
  { id: 'anneal-decision', spec: 'tests/stress-anneal-decision.spec.js', epic: EPIC_ANNEAL },
  { id: 'rebase-discipline', spec: 'tests/stress-rebase-discipline.spec.js', epic: EPIC_REBASE },
  { id: 'role-baton-linter', spec: 'tests/stress-role-baton-linter.spec.js', epic: EPIC_ROLE_BATON },
];

function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function runOne(spec) {
  const start = Date.now();
  let passed = false, output = '';
  try {
    output = execSync(`node --test ${spec}`,
      { encoding: 'utf8', timeout: SUITE_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] });
    passed = true;
  } catch (err) {
    output = (err.stdout?.toString('utf8') || '') + (err.stderr?.toString('utf8') || '');
  }
  const elapsedMs = Date.now() - start;
  const passMatch = output.match(/pass\s+(\d+)/);
  const failMatch = output.match(/fail\s+(\d+)/);
  return { passed, elapsedMs,
    pass_count: passMatch ? Number(passMatch[1]) : 0,
    fail_count: failMatch ? Number(failMatch[1]) : 0,
    sample_output: output.slice(-OUTPUT_TRUNCATE) };
}

function buildEvent(suite, result) {
  const event = {
    ts: Date.now(), version: 'v3', service: SERVICE, env: process.env.MEGINGJORD_ENV || 'local',
    event: result.passed ? 'stress.suite.pass' : 'stress.suite.fail',
    'gen_ai.system': 'megingjord-harness',
    'gen_ai.operation.name': 'stress_test',
    'gen_ai.tool.name': suite.id,
    epic_ref: suite.epic, spec_path: suite.spec, elapsed_ms: result.elapsedMs,
    pass_count: result.pass_count, fail_count: result.fail_count,
    _summary: `${suite.id} stress: ${result.pass_count} pass / ${result.fail_count} fail in ${result.elapsedMs}ms`,
  };
  return redactEvent(event).event;
}

function emitTelemetry(suite, result, file = INCIDENTS_FILE) {
  ensureDir(file);
  fs.appendFileSync(file, JSON.stringify(buildEvent(suite, result)) + '\n', 'utf8');
}

function run(opts = {}) {
  const start = Date.now();
  const results = [];
  for (const suite of (opts.suites || SUITES)) {
    const result = runOne(suite.spec);
    results.push({ suite, result });
    if (!opts.noTelemetry) emitTelemetry(suite, result);
  }
  const totalMs = Date.now() - start;
  const allPassed = results.every(r => r.result.passed);
  return { ok: allPassed, suites: results.length, total_ms: totalMs,
    pass_count: results.reduce((s, r) => s + r.result.pass_count, 0),
    fail_count: results.reduce((s, r) => s + r.result.fail_count, 0),
    suite_results: results.map(({ suite, result }) => ({
      id: suite.id, epic: suite.epic, passed: result.passed,
      pass_count: result.pass_count, fail_count: result.fail_count,
      elapsed_ms: result.elapsedMs })) };
}

if (require.main === module) {
  const result = run({ noTelemetry: process.argv.includes('--no-telemetry') });
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    for (const sr of result.suite_results) {
      const mark = sr.passed ? '✓' : '✗';
      process.stdout.write(`  ${mark} ${sr.id} (epic #${sr.epic}): ${sr.pass_count} pass / ${sr.fail_count} fail (${sr.elapsed_ms}ms)\n`);
    }
    process.stdout.write(`\n${result.pass_count} pass / ${result.fail_count} fail total · ${result.total_ms}ms\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = { run, runOne, buildEvent, emitTelemetry, SUITES };
