#!/usr/bin/env node
// tier: 3
// otel-gen-ai-content-validator — assert that emitted gen_ai.* attributes
// MATCH the wrapper-declared provider/model/operation per #2028.
// Mitigates red-team Attack #2 from Epic #1962: an agent emitting
// gen_ai.system="anthropic" while actually calling a different provider
// would defeat attribution. The schema-only validator (otel-gen-ai-emit)
// catches missing keys; this validator catches LYING keys.

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const INCIDENT_LOG = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
const ALLOWED_OPERATIONS = ['chat', 'completion', 'embedding', 'tool_call', 'batch'];
const KNOWN_SYSTEMS = new Set([
  'anthropic', 'openai', 'openai-compatible', 'gemini', 'groq',
  'cerebras', 'openrouter', 'ollama-fleet', 'unknown',
]);

/** Validate that the declared system matches the actually-invoked provider.
 * @param {object} declared - { system, model, operation } from emitted attrs.
 * @param {object} actual - { provider, model } from wrapper context.
 * @returns {object} { ok, violations }. */
function validateAttribution(declared, actual) {
  const violations = [];
  if (declared['gen_ai.system'] !== actual.provider) {
    violations.push({
      rule: 'system-mismatch',
      declared: declared['gen_ai.system'],
      actual: actual.provider,
    });
  }
  if (actual.model && declared['gen_ai.request.model'] !== actual.model) {
    violations.push({
      rule: 'model-mismatch',
      declared: declared['gen_ai.request.model'],
      actual: actual.model,
    });
  }
  return { ok: violations.length === 0, violations };
}

/** Validate the operation name against the allowed enum.
 * @param {string} operation - the declared operation name.
 * @returns {object} { ok, reason }. */
function validateOperation(operation) {
  if (!operation) return { ok: false, reason: 'operation-missing' };
  if (!ALLOWED_OPERATIONS.includes(operation)) {
    return { ok: false, reason: 'operation-not-in-enum', operation, allowed: ALLOWED_OPERATIONS };
  }
  return { ok: true };
}

/** Validate the system against the known providers set.
 * @param {string} system - the declared gen_ai.system value.
 * @returns {object} { ok, reason }. */
function validateSystem(system) {
  if (!system) return { ok: false, reason: 'system-missing' };
  if (!KNOWN_SYSTEMS.has(system)) {
    return { ok: false, reason: 'system-not-recognized', system };
  }
  return { ok: true };
}

/** Append a content-semantic violation to incidents.jsonl (advisory mode).
 * @param {object} payload - violation context.
 * @returns {boolean} write success. */
function logIncident(payload) {
  try {
    fs.mkdirSync(path.dirname(INCIDENT_LOG), { recursive: true });
    const record = {
      ts: Date.now(),
      version: 'v3',
      service: 'megingjord-harness',
      env: 'local',
      event: 'gen_ai.content-validation.fail',
      pattern_id: 'otel-gen-ai-content-mismatch',
      ...payload,
    };
    fs.appendFileSync(INCIDENT_LOG, JSON.stringify(record) + '\n');
    return true;
  } catch (_e) {
    return false;
  }
}

/** Full content-semantic validation: attribution + operation + system + log.
 * @param {object} declared - emitted gen_ai.* attribute map.
 * @param {object} actual - wrapper context.
 * @param {object} [opts] - { hardFail: false } for blocking mode.
 * @returns {object} { ok, violations, incident_logged }. */
function validate(declared, actual, opts = {}) {
  const attribution = validateAttribution(declared, actual);
  const operation = validateOperation(declared['gen_ai.operation.name']);
  const system = validateSystem(declared['gen_ai.system']);
  const violations = [
    ...attribution.violations,
    ...(operation.ok ? [] : [{ rule: 'operation', ...operation }]),
    ...(system.ok ? [] : [{ rule: 'system', ...system }]),
  ];
  let incident_logged = false;
  if (violations.length > 0) {
    incident_logged = logIncident({ declared, actual, violations });
  }
  return {
    ok: violations.length === 0,
    violations,
    incident_logged,
    hard_fail: opts.hardFail && violations.length > 0,
  };
}

if (require.main === module) {
  const sample = validate(
    { 'gen_ai.system': 'anthropic', 'gen_ai.request.model': 'claude-opus-4-7', 'gen_ai.operation.name': 'chat' },
    { provider: 'anthropic', model: 'claude-opus-4-7' }
  );
  console.log(JSON.stringify(sample, null, 2));
}

module.exports = {
  validateAttribution, validateOperation, validateSystem,
  validate, logIncident,
  ALLOWED_OPERATIONS, KNOWN_SYSTEMS, INCIDENT_LOG,
};
