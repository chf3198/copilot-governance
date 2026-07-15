#!/usr/bin/env node
'use strict';

const CONFIDENCE = ['exact_request', 'exact_aggregate', 'derived', 'estimated', 'unknown'];

function n(v) { return Number.isFinite(Number(v)) ? Number(v) : 0; }

function laneConfidence(lane) {
  if (lane === 'haiku' || lane === 'premium') return 'derived';
  return 'estimated';
}

function normalizeTokenRecord(entry = {}) {
  const input = n(entry.input_tokens);
  const output = n(entry.output_tokens);
  const cacheRead = n(entry.cache_read_tokens);
  const cacheWrite = n(entry.cache_write_tokens);
  const reasoning = n(entry.reasoning_tokens);
  const total = entry.total_tokens == null
    ? input + output + cacheRead + cacheWrite + reasoning
    : n(entry.total_tokens);
  const level = CONFIDENCE.includes(entry.confidence_level)
    ? entry.confidence_level
    : laneConfidence(entry.lane);
  return {
    provider: entry.provider || entry.lane || 'unknown',
    model: entry.model || 'unknown',
    timestamp: entry.timestamp || new Date().toISOString(),
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: cacheRead,
    cache_write_tokens: cacheWrite,
    reasoning_tokens: reasoning,
    total_tokens: total,
    cost_usd: entry.cost_usd == null ? null : n(entry.cost_usd),
    confidence_level: level,
    caveat_code: entry.caveat_code || null,
    caveat_detail: entry.caveat_detail || null,
    request_id: entry.request_id || null,
    source_kind: entry.source_kind || 'routing_telemetry',
  };
}

module.exports = { CONFIDENCE, normalizeTokenRecord };
