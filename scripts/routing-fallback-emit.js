#!/usr/bin/env node
// routing-fallback-emit.js — Fleet-fallback telemetry emitter. Refs #2351.
// Emits one JSONL line to ~/.megingjord/routing-fallback.jsonl per fallback event.
// Uses log-redaction. Best-effort: never throws to caller.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const FALLBACK_LOG = path.join(os.homedir(), '.megingjord', 'routing-fallback.jsonl');
const SERVICE = 'model-routing-engine';

function hashPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 12);
}

function buildEvent(params) {
  const { role, laneIntended, laneActual, fallbackReason, prompt } = params || {};
  return {
    version: 3,
    ts: new Date().toISOString(),
    service: SERVICE,
    env: process.env.NODE_ENV === 'test' ? 'test' : 'local',
    event: 'routing.fallback',
    role: role || null,
    lane_intended: laneIntended || null,
    lane_actual: laneActual || null,
    fallback_reason: fallbackReason || 'lane_unavailable',
    prompt_hash: hashPrompt(prompt),
    _summary: `Fallback: ${laneIntended} -> ${laneActual} for role=${role}`,
  };
}

function applyRedaction(event) {
  try {
    const { redactEvent } = require('./log-redaction');
    return redactEvent(event).event;
  } catch {
    return event;
  }
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Emit a fallback routing event to ~/.megingjord/routing-fallback.jsonl.
 * @param {object} params - { role, laneIntended, laneActual, fallbackReason, prompt }
 * @returns {boolean} true on success, false on failure (best-effort)
 */
function emitFallback(params) {
  try {
    const raw = buildEvent(params);
    const event = applyRedaction(raw);
    ensureDir(FALLBACK_LOG);
    fs.appendFileSync(FALLBACK_LOG, JSON.stringify(event) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

module.exports = { emitFallback, buildEvent, FALLBACK_LOG };
