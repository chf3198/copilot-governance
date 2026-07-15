'use strict';
// doc-coverage-event-emit — appends doc_coverage_event entries to
// ~/.megingjord/incidents.jsonl. Wraps event-schema-v3 + log-redaction.
// Refs #2158. Consumed by C2 doc-coverage validator + C5 changelog-fragment-presence.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isValidV3, normalize } = require('./event-schema-v3');
const { wrapWrite } = require('./log-redaction');

const DEFAULT_LOG_PATH = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
const REQUIRED_KEYS = ['ticket', 'validator', 'verdict'];
const VALID_VERDICTS = ['pass', 'advisory', 'fail'];
const VALID_VALIDATORS = ['tech-writer-subphase', 'changelog-fragment-presence', 'wiki-lint-gate', 'doc-coverage'];

function buildEvent(input) {
  const base = {
    ts: input.ts || new Date().toISOString(),
    version: 3,
    service: input.service || 'megingjord-doc-governance',
    env: input.env || 'prod',
    event: 'doc_coverage_event',
    ticket: input.ticket,
    validator: input.validator,
    verdict: input.verdict,
    surfaces_required: input.surfaces_required || [],
    surfaces_updated: input.surfaces_updated || [],
    surfaces_na: input.surfaces_na || [],
  };
  if (input.trace_id) base.trace_id = input.trace_id;
  if (input.session_id) base.session_id = input.session_id;
  return normalize(base);
}

function validateInput(input) {
  for (const key of REQUIRED_KEYS) {
    if (input[key] === undefined || input[key] === null) {
      throw new Error(`doc_coverage_event missing required field: ${key}`);
    }
  }
  if (!VALID_VERDICTS.includes(input.verdict)) {
    throw new Error(`doc_coverage_event invalid verdict: ${input.verdict} (expected one of ${VALID_VERDICTS.join(', ')})`);
  }
  if (!VALID_VALIDATORS.includes(input.validator)) {
    throw new Error(`doc_coverage_event unknown validator: ${input.validator}`);
  }
}

function writeToFile(logPath, event) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(event) + '\n');
}

function emitDocCoverageEvent(input, opts = {}) {
  validateInput(input);
  const event = buildEvent(input);
  if (!isValidV3(event)) {
    throw new Error('doc_coverage_event failed event-schema-v3 validation');
  }
  const logPath = opts.logPath || DEFAULT_LOG_PATH;
  const safeWrite = wrapWrite((evt) => writeToFile(logPath, evt));
  safeWrite(event);
  return event;
}

module.exports = { emitDocCoverageEvent, buildEvent, validateInput, DEFAULT_LOG_PATH, VALID_VERDICTS, VALID_VALIDATORS };
