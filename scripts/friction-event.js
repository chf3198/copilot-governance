'use strict';
// friction-event.js — structured per-team friction-event schema (#3165, Epic #3008/#3095).
//
// A "friction" is any harness pothole an operator hits mid-flight: a gate false-block, a
// workaround, a retry, a fleet timeout. Today these are captured ad hoc in prose (e.g. the
// Cursor Team's 18-item manual log on #3008) or lost, so cross-team recurrence goes
// undetected. emitFriction writes a REDACTED v3 event tagged `tier: 1` + `pattern_id` +
// `severity` to incidents.jsonl, so the existing anneal-tier2-autofile recurrence model
// (classifyTier1: count >= 2 by pattern_id) routes recurring frictions to Tier-2 with no
// extra plumbing. Cross-team weighting lives in friction-recurrence.js.

const os = require('os');
const path = require('path');
const fs = require('fs');
const { V3, emitV3 } = require('./event-schema-v3');
const { redactEvent } = require('./log-redaction');

const INCIDENTS_FILE = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');
const CATALOG_FILE = path.join(__dirname, '..', '..', 'config', 'friction-pattern-catalog.json');
const FRICTION_EVENT = 'governance.friction';
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const DEFAULT_SEVERITY = 'low';

function buildFrictionEvent(patternId, fields = {}, now) {
  const severity = SEVERITIES.includes(fields.severity) ? fields.severity : DEFAULT_SEVERITY;
  const event = {
    version: V3,
    ts: now || new Date().toISOString(),
    service: 'friction',
    env: fields.env || 'local',
    event: FRICTION_EVENT,
    tier: 1, // tier:1 => consumed by the anneal-tier2-autofile recurrence detector
    pattern_id: patternId,
    team: fields.team || 'unknown',
    runtime: fields.runtime || 'unknown',
    role: fields.role || null,
    surface: fields.surface || null,
    severity,
    workaround: fields.workaround || null,
    trigger_role: fields.role || 'system',
    trigger_type: 'friction',
  };
  if (fields.cost !== undefined && fields.cost !== null) event.cost = fields.cost;
  if (fields.detail) event.detail = fields.detail;
  return event;
}

function isValidFriction(event) {
  const errors = [];
  if (!event || typeof event !== 'object') return { ok: false, errors: ['event must be an object'] };
  if (event.event !== FRICTION_EVENT) errors.push(`event must be ${FRICTION_EVENT}`);
  if (!event.pattern_id) errors.push('missing pattern_id');
  if (event.tier !== 1) errors.push('friction events must be tier:1');
  if (!SEVERITIES.includes(event.severity)) errors.push(`severity must be one of ${SEVERITIES.join('|')}`);
  return { ok: errors.length === 0, errors };
}

// G4: redact at the instrumentation site, never scrub at storage.
function emitFriction(patternId, fields = {}, opts = {}) {
  const file = opts.file || INCIDENTS_FILE;
  // redactEvent returns { event, hits }; we persist the redacted event only.
  const { event } = redactEvent(buildFrictionEvent(patternId, fields, opts.now));
  const { ok, errors } = isValidFriction(event);
  if (!ok) throw new Error(`invalid friction event: ${errors.join('; ')}`);
  emitV3(event, file);
  return event;
}

function loadFrictionCatalog(file = CATALOG_FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { patterns: [] }; }
}

function isKnownPattern(patternId, catalog = loadFrictionCatalog()) {
  return (catalog.patterns || []).some((entry) => entry.pattern_id === patternId);
}

module.exports = {
  FRICTION_EVENT, SEVERITIES, INCIDENTS_FILE, CATALOG_FILE,
  buildFrictionEvent, isValidFriction, emitFriction, loadFrictionCatalog, isKnownPattern,
};
