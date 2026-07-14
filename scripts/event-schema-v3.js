#!/usr/bin/env node
// tier: 2
// event-schema-v3.js — Unified event schema v3 for all *.jsonl logging surfaces.
// Epic #1339 / #1353. Foundation for harness + HAMR observability.
//
// V3 generalizes the anneal v2 schema (scripts/global/anneal-event-schema.js)
// to cover ALL logging surfaces: incidents.jsonl, cache-stats.jsonl,
// events.jsonl, and future surfaces. Includes OpenTelemetry GenAI namespace
// support per R&D Thread 1.
//
// Backward-compat: v1 (no version) and v2 anneal events upgrade-on-read. v1/v2
// readers ignore unknown v3 fields.
'use strict';

const V3 = 3;
const V3_REQUIRED = ['ts', 'version', 'service', 'env', 'event'];
const V3_RECOMMENDED = ['trace_id', 'session_id'];
const VALID_ENVS = ['local', 'ci', 'cloudflare', 'test'];
const SUMMARY_MAX = 200;
const OTEL_GENAI_PREFIX = 'gen_ai.';

const V2_ANNEAL_FIELDS = ['tier', 'trigger_role', 'trigger_type', 'pattern_id',
  'severity', 'evidence', 'ticket_ref', 'epic_ref'];

function detectVersion(event) {
  if (!event || typeof event !== 'object') return 0;
  if (event.version === undefined) return 1;
  return event.version;
}

function isValidV3(event) {
  const errors = [];
  if (!event || typeof event !== 'object') {
    return { ok: false, errors: ['event must be an object'] };
  }
  if (event.version !== V3) errors.push(`version must be ${V3}`);
  for (const field of V3_REQUIRED) {
    if (event[field] === undefined) errors.push(`missing required v3 field: ${field}`);
  }
  if (event.env !== undefined && !VALID_ENVS.includes(event.env)) {
    errors.push(`env must be one of ${VALID_ENVS.join('|')}`);
  }
  if (event._summary !== undefined) {
    if (typeof event._summary !== 'string') errors.push('_summary must be a string');
    else if (event._summary.length > SUMMARY_MAX) {
      errors.push(`_summary exceeds ${SUMMARY_MAX} chars`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function upgradeToV3(event, surfaceContext = {}) {
  const ver = detectVersion(event);
  const ts = event.ts || event.timestamp || new Date().toISOString();
  const base = {
    version: V3,
    ts,
    service: surfaceContext.service || event.service || 'unknown',
    env: surfaceContext.env || event.env || 'local',
    event: surfaceContext.event || event.event || 'legacy',
    trace_id: event.trace_id || event.session_id || null,
    session_id: event.session_id || 'legacy',
    surface: surfaceContext.surface || event.surface || null,
  };
  // Preserve v2 anneal fields if present (additive)
  if (ver === 2) {
    for (const fieldName of V2_ANNEAL_FIELDS) {
      if (event[fieldName] !== undefined) base[fieldName] = event[fieldName];
    }
  }
  // Preserve all v1 fields too (consumer compat)
  return Object.assign({}, event, base, { version: V3 });
}

function normalize(event, surfaceContext = {}) {
  if (detectVersion(event) === V3) return event;
  return upgradeToV3(event, surfaceContext);
}

function isOtelGenAI(event) {
  if (!event || typeof event !== 'object') return false;
  return Object.keys(event).some(k => k.startsWith(OTEL_GENAI_PREFIX));
}

function emitV3(event, file) {
  const enriched = Object.assign({
    team: process.env.HAMR_TEAM || process.env.MEGINGJORD_TEAM || 'unknown',
    trigger_role: 'system',
  }, event);
  if (!enriched.team) enriched.team = 'unknown';
  if (!enriched.trigger_role) enriched.trigger_role = 'system';
  const { ok, errors } = isValidV3(enriched);
  if (!ok) throw new Error(`Invalid v3 event: ${errors.join('; ')}`);
  const fs = require('fs');
  const path = require('path');
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
}

function readEvents(file, surfaceContext = {}) {
  const fs = require('fs');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean)
    .map(ev => normalize(ev, surfaceContext));
}

const { isValidGenAI, OTEL_GENAI_SYSTEMS } = require('./event-schema-otel-genai');

module.exports = {
  V3, V3_REQUIRED, V3_RECOMMENDED, VALID_ENVS, SUMMARY_MAX, OTEL_GENAI_PREFIX,
  V2_ANNEAL_FIELDS,
  detectVersion, isValidV3, upgradeToV3, normalize, isOtelGenAI,
  isValidGenAI, OTEL_GENAI_SYSTEMS,
  emitV3, readEvents,
};
