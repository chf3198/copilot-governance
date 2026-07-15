#!/usr/bin/env node
// harness-self-test-telemetry (#1826 AC5) — emits per-check results as OTel GenAI events
// to ~/.megingjord/incidents.jsonl. Schema follows event-schema-v3 + gen_ai.* namespace.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { redactEvent } = require('./log-redaction');

const INCIDENTS_FILE = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
const SERVICE = 'megingjord-harness-self-test';
const ENV = process.env.MEGINGJORD_ENV || 'local';
const OBSERVED_TRUNCATE = 500;

function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildEvent(check, result) {
  const passed = result.passed === true;
  const event = {
    ts: Date.now(),
    version: 'v3',
    service: SERVICE,
    env: ENV,
    event: passed ? 'harness-self-test.check.pass' : 'harness-self-test.check.fail',
    'gen_ai.system': 'megingjord-harness',
    'gen_ai.operation.name': 'self_test_check',
    'gen_ai.tool.name': check.id,
    check_id: check.id,
    check_name: check.name,
    check_category: check.category,
    expected: check.expected,
    observed: String(result.observed || '').slice(0, OBSERVED_TRUNCATE),
    diagnosis: result.diagnosis || (passed ? 'pass' : 'fail'),
    recommend_action: passed ? null : (check.fail_recommend || 'no recommendation registered'),
    exit_code: result.exitCode ?? null,
    elapsed_ms: result.elapsedMs ?? null,
    _summary: passed
      ? `${check.id}: pass`
      : `${check.id}: fail (${result.diagnosis || 'see observed'}) → ${check.fail_recommend || '?'}`,
  };
  return redactEvent(event).event;
}

function emit(check, result, opts = {}) {
  const file = opts.file ?? INCIDENTS_FILE;
  ensureDir(file);
  const event = buildEvent(check, result);
  fs.appendFileSync(file, JSON.stringify(event) + '\n', { encoding: 'utf8' });
  return event;
}

function emitBatch(checkResults, opts = {}) {
  return checkResults.map(({ check, result }) => emit(check, result, opts));
}

module.exports = { buildEvent, emit, emitBatch, INCIDENTS_FILE, SERVICE };
