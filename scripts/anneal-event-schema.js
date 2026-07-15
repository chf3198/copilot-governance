#!/usr/bin/env node
// anneal-event-schema.js — Event schema v2 validators + backward-compat shim
// Epic #1308 — Workstream B / #1315
// Expand-contract pattern: v2 fields are additive-only. v1 readers continue to
// work against v2 events by ignoring unknown fields (no removal, no renaming).
// v1 events (no `version` field) are accepted and upgraded on demand.
'use strict';

const fs = require('fs');
const path = require('path');
const INCIDENTS_FILE = path.join(process.env.HOME, '.megingjord', 'incidents.jsonl');

// ─── V1 field set ────────────────────────────────────────────────────────────
// Fields used by existing v1 readers (anneal-goal-sensor.js, anneal-review.js,
// anneal-graph.js). Must never be removed or renamed in v2.
const V1_REQUIRED = ['timestamp'];
const V1_OPTIONAL = [
  'status', 'pattern_id', 'count', 'window_start', 'evidence',
  'suppression_until', 'updated_at',
];

// ─── V2 new fields (additive only) ───────────────────────────────────────────
const V2_REQUIRED = ['version', 'timestamp', 'tier', 'trigger_role',
  'trigger_type', 'severity', 'session_id'];
const VALID_TIERS = [1, 2, 3];
const VALID_ROLES = ['manager', 'collaborator', 'admin', 'consultant', 'system'];
const VALID_TRIGGERS = [
  'pattern-recurrence', 'manual-pull', 'goal-failure', 'sensor-driven',
];
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];

// ─── Validators ──────────────────────────────────────────────────────────────

/**
 * Accept any object that has a `timestamp` field (v1 contract minimum).
 * Does NOT require `version`; absence of `version` means v1.
 * @param {object} event
 * @returns {{ ok: boolean, errors: string[] }}
 */
function isValidV1(event) {
  const errors = [];
  if (!event || typeof event !== 'object') {
    return { ok: false, errors: ['event must be an object'] };
  }
  for (const field of V1_REQUIRED) {
    if (event[field] === undefined) errors.push(`missing required v1 field: ${field}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Validate a v2 event. Unknown extra fields are allowed (forward-compat).
 * v1 readers rely on: timestamp, status, pattern_id, count, evidence — all
 * must be preserved when present.
 * @param {object} event
 * @returns {{ ok: boolean, errors: string[] }}
 */
function isValidV2(event) {
  const errors = [];
  if (!event || typeof event !== 'object') {
    return { ok: false, errors: ['event must be an object'] };
  }
  if (event.version !== 2) errors.push('version must be 2');
  for (const field of V2_REQUIRED) {
    if (event[field] === undefined) errors.push(`missing required v2 field: ${field}`);
  }
  if (event.tier !== undefined && !VALID_TIERS.includes(event.tier)) {
    errors.push(`tier must be one of ${VALID_TIERS.join('|')}`);
  }
  if (event.trigger_role !== undefined && !VALID_ROLES.includes(event.trigger_role)) {
    errors.push(`trigger_role must be one of ${VALID_ROLES.join('|')}`);
  }
  if (event.trigger_type !== undefined && !VALID_TRIGGERS.includes(event.trigger_type)) {
    errors.push(`trigger_type must be one of ${VALID_TRIGGERS.join('|')}`);
  }
  if (event.severity !== undefined && !VALID_SEVERITIES.includes(event.severity)) {
    errors.push(`severity must be one of ${VALID_SEVERITIES.join('|')}`);
  }
  return { ok: errors.length === 0, errors };
}

// ─── Shim ─────────────────────────────────────────────────────────────────────

/**
 * Upgrade a v1 event to v2 by adding defaults for new fields.
 * All original v1 fields are preserved exactly; new fields receive safe defaults
 * so v2-aware consumers can always read them.
 * @param {object} v1Event
 * @param {Partial<object>} overrides  Optional v2-specific fields to set
 * @returns {object} v2 event
 */
function upgradeV1ToV2(v1Event, overrides = {}) {
  return Object.assign({
    version: 2,
    tier: 1,
    trigger_role: 'system',
    trigger_type: 'sensor-driven',
    pattern_id: null,
    severity: 'low',
    evidence: [],
    ticket_ref: null,
    epic_ref: null,
    session_id: 'legacy',
    schema_compat: 'v1-readers-must-ignore-fields-not-in-v1',
  }, v1Event, { version: 2 }, overrides);
}

// ─── Detect version ──────────────────────────────────────────────────────────

/**
 * Return the schema version of an event.
 * Absence of `version` field means v1 (legacy).
 * @param {object} event
 * @returns {1|2|number}
 */
function detectVersion(event) {
  if (!event || event.version === undefined) return 1;
  return event.version;
}

// ─── Normalise (v1 → v2 if needed) ──────────────────────────────────────────

/**
 * Ensure any event is v2-shaped for v2-aware consumers.
 * v2 events pass through unchanged; v1 events are upgraded.
 * @param {object} event
 * @param {object} [overrides]
 * @returns {object}
 */
function normalise(event, overrides = {}) {
  if (detectVersion(event) === 2) return event;
  return upgradeV1ToV2(event, overrides);
}

// ─── Emit helper ─────────────────────────────────────────────────────────────

/**
 * Append a v2 event to the incidents.jsonl file.
 * Validates the event before writing. Throws on invalid.
 * @param {object} event  Must already be a valid v2 event.
 * @param {string} [file] Override incidents file path (for tests).
 */
function emitEvent(event, file = INCIDENTS_FILE) {
  const { ok, errors } = isValidV2(event);
  if (!ok) throw new Error(`Invalid v2 event: ${errors.join('; ')}`);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
}

// ─── Feed reader (mixed v1/v2) ───────────────────────────────────────────────

/**
 * Read incidents.jsonl and return all events, each normalised to v2.
 * Skips unparseable lines. Compatible with v1-only feeds.
 * @param {string} [file] Override incidents file path (for tests).
 * @returns {object[]}
 */
function readEvents(file = INCIDENTS_FILE) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean)
    .map(ev => normalise(ev));
}

module.exports = {
  isValidV1,
  isValidV2,
  upgradeV1ToV2,
  detectVersion,
  normalise,
  emitEvent,
  readEvents,
  VALID_TIERS,
  VALID_ROLES,
  VALID_TRIGGERS,
  VALID_SEVERITIES,
  INCIDENTS_FILE,
};
