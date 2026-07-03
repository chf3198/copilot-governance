#!/usr/bin/env node
// harness-self-test (#1826) — main entrypoint. Reads registry, runs checks, reports + emits telemetry.
// Modes: --capability | --regression | (default: both). Formats: --human | --json | --markdown.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runAll } = require('./harness-self-test-runner');
const { render } = require('./harness-self-test-reporters');
const { emitBatch } = require('./harness-self-test-telemetry');

const REGISTRY_PATH = path.join(__dirname, '..', '..', 'inventory', 'harness-self-test-registry.json');

function detectAdapter() {
  if (process.env.MEGINGJORD_ADAPTER) return process.env.MEGINGJORD_ADAPTER;
  if (fs.existsSync(path.join(process.env.HOME || '/tmp', '.claude'))) return 'claude-code';
  if (fs.existsSync(path.join(process.env.HOME || '/tmp', '.copilot'))) return 'copilot';
  if (fs.existsSync(path.join(process.env.HOME || '/tmp', '.codex'))) return 'codex';
  return 'unknown';
}

function loadRegistry(file = REGISTRY_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function filterByCategory(checks, mode) {
  if (mode === 'capability') return checks.filter(c => c.category === 'capability');
  if (mode === 'regression') return checks.filter(c => c.category === 'regression');
  return checks;
}

function parseArgs(argv) {
  const mode = argv.includes('--capability') ? 'capability'
    : argv.includes('--regression') ? 'regression' : 'both';
  const format = argv.includes('--json') ? 'json'
    : argv.includes('--markdown') ? 'markdown' : 'human';
  const noTelemetry = argv.includes('--no-telemetry');
  return { mode, format, noTelemetry };
}

function main(argv = process.argv.slice(2)) {
  const { mode, format, noTelemetry } = parseArgs(argv);
  const registry = loadRegistry();
  const adapter = detectAdapter();
  const checks = filterByCategory(registry.checks, mode);
  const start = Date.now();
  const results = runAll(checks, { adapter, exemptions: registry.adapter_exemptions });
  const elapsedMs = Date.now() - start;
  const passedCount = results.filter(r => r.result.passed).length;
  const exitCode = passedCount === results.length ? 0 : 1;
  const summary = { adapter, mode, format, total: results.length, passed_count: passedCount,
    failed_count: results.length - passedCount, elapsed_ms: elapsedMs, exit_code: exitCode,
    registry_version: registry.version };
  process.stdout.write(render(results, summary, format) + '\n');
  if (!noTelemetry) emitBatch(results);
  return exitCode;
}

if (require.main === module) process.exit(main());

module.exports = { main, loadRegistry, filterByCategory, parseArgs, detectAdapter,
  REGISTRY_PATH };
