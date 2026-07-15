#!/usr/bin/env node
// otel-gen-ai-emit — OpenTelemetry GenAI semantic-conventions emission helper.
// Per #1969 AC1-AC7. gen_ai.* namespace exited experimental in 2026.
// Reference: opentelemetry.io/docs/specs/semconv/gen-ai/
// G4: credential surface scrubbed via sanitizeAttribute().
// G6: emit failures never block provider call; caller catches via try/catch.

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const EVENT_LOG = path.join(os.homedir(), '.megingjord', 'events.jsonl');
const CACHE_STATS_LOG = path.join(os.homedir(), '.megingjord', 'cache-stats.jsonl');
const CRED_RE = /(api[_-]?key|token|password|secret|bearer)[\s:=]+[\w\-.]{6,}/gi;
const TOKEN_ID_RE = /\b(sk-[A-Za-z0-9]{8,}|tk-[A-Za-z0-9]{8,}|ya29\.[A-Za-z0-9_-]{8,})\b/g;

/** Scrub credential / token-id strings from a stringified attribute value.
 * @param {*} v - attribute value (any type).
 * @returns {*} - sanitized value (only strings are scrubbed). */
function sanitizeAttribute(v) {
  if (typeof v !== 'string') return v;
  return v.replace(CRED_RE, '[REDACTED]').replace(TOKEN_ID_RE, '[REDACTED-ID]');
}

/** Build OpenTelemetry GenAI semantic-conventions attribute map for a provider call.
 * @param {object} ctx - { provider, model, operation, request, response }.
 * @returns {object} flat map of gen_ai.* attributes (sanitized values). */
function buildGenAiAttributes(ctx) {
  const provider = ctx.provider || 'unknown';
  const model = ctx.model || (ctx.request && ctx.request.model) || null;
  const operation = ctx.operation || 'chat';
  const usage = (ctx.response && (ctx.response.usage || ctx.response.token_usage)) || {};
  const input_tokens = usage.input_tokens ?? usage.prompt_tokens ?? null;
  const output_tokens = usage.output_tokens ?? usage.completion_tokens ?? null;
  const attrs = {
    'gen_ai.system': provider,
    'gen_ai.operation.name': operation,
    'gen_ai.request.model': model,
    'gen_ai.usage.input_tokens': input_tokens,
    'gen_ai.usage.output_tokens': output_tokens,
  };
  const out = {};
  for (const [k, v] of Object.entries(attrs)) out[k] = sanitizeAttribute(v);
  return out;
}

/** Append a single JSONL line to a path; never throws.
 * @param {string} file - destination JSONL path.
 * @param {object} record - the record to append.
 * @returns {boolean} - true on success, false on failure (degraded mode). */
function appendJsonl(file, record) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(record) + '\n');
    return true;
  } catch (_e) {
    return false;
  }
}

/** Emit a gen_ai LLM-step event with sanitized attributes; tolerant of disk failure.
 * @param {object} ctx - call context with provider/model/operation/request/response.
 * @returns {object} - { ok, attributes, written } summary.
 */
function emitGenAiEvent(ctx) {
  const attributes = buildGenAiAttributes(ctx);
  const record = {
    ts: Date.now(),
    version: 'v3',
    service: 'megingjord-harness',
    env: 'local',
    event: 'gen_ai.llm.step',
    ...attributes,
  };
  const written_events = appendJsonl(EVENT_LOG, record);
  const written_cache = appendJsonl(CACHE_STATS_LOG, record);
  return { ok: true, attributes, written: { events: written_events, cache_stats: written_cache } };
}

/** Wrap a synchronous emission with perf measurement (returns elapsed ms).
 * @param {object} ctx - same as emitGenAiEvent.
 * @returns {object} - { ok, attributes, written, elapsed_ms }. */
function emitWithTiming(ctx) {
  const start = process.hrtime.bigint();
  const result = emitGenAiEvent(ctx);
  const elapsed_ns = Number(process.hrtime.bigint() - start);
  return { ...result, elapsed_ms: elapsed_ns / 1e6 };
}

if (require.main === module) {
  const out = emitGenAiEvent({ provider: 'anthropic', model: 'claude-opus-4-7', operation: 'chat', response: { usage: { input_tokens: 100, output_tokens: 50 } } });
  console.log(JSON.stringify(out, null, 2));
}

module.exports = {
  sanitizeAttribute, buildGenAiAttributes, appendJsonl,
  emitGenAiEvent, emitWithTiming,
  EVENT_LOG, CACHE_STATS_LOG, CRED_RE, TOKEN_ID_RE,
};
