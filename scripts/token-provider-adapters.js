#!/usr/bin/env node
'use strict';
// tier: 3

const { normalizeTokenRecord } = require('./token-ledger-schema');

function n(v) { return Number.isFinite(Number(v)) ? Number(v) : 0; }

function mk(base, patch = {}) {
  return normalizeTokenRecord({ ...base, ...patch });
}

function anthropic(payload = {}, base = {}) {
  const usage = payload.usage || {};
  return mk(base, {
    provider: 'anthropic', model: payload.model || base.model,
    input_tokens: n(usage.input_tokens), output_tokens: n(usage.output_tokens),
    cache_read_tokens: n(usage.cache_read_input_tokens),
    cache_write_tokens: n(usage.cache_creation_input_tokens),
    confidence_level: 'exact_request', request_id: payload.id || base.request_id,
    source_kind: 'anthropic_messages',
    raw_usage: usage,
  });
}

function openrouter(payload = {}, base = {}) {
  const usage = payload.usage || {};
  return mk(base, {
    provider: 'openrouter', model: payload.model || base.model,
    input_tokens: n(usage.prompt_tokens), output_tokens: n(usage.completion_tokens),
    cache_read_tokens: n(usage.cached_tokens || (usage.prompt_tokens_details || {}).cached_tokens),
    reasoning_tokens: n(usage.reasoning_tokens), total_tokens: n(usage.total_tokens),
    cost_usd: payload.cost ?? usage.cost ?? base.cost_usd, confidence_level: 'exact_request',
    request_id: payload.id || payload.generation_id || base.request_id, source_kind: 'openrouter'
  });
}

function litellm(payload = {}, base = {}) {
  const usage = payload.usage || {};
  const details = usage.prompt_tokens_details || {};
  return mk(base, {
    provider: 'litellm', model: payload.model || base.model,
    input_tokens: n(payload.prompt_tokens || usage.prompt_tokens),
    output_tokens: n(payload.completion_tokens || usage.completion_tokens),
    cache_read_tokens: n(details.cached_tokens || usage.prompt_cache_hit_tokens),
    total_tokens: n(payload.total_tokens || usage.total_tokens),
    cost_usd: payload.spend ?? payload.cost,
    confidence_level: payload.pricing_fresh === false ? 'estimated' : 'derived',
    request_id: payload.request_id || payload.id || base.request_id, source_kind: 'litellm_spend_log'
  });
}

function gemini(payload = {}, base = {}) {
  const usage = payload.usageMetadata || payload.usage_metadata || {};
  return mk(base, {
    provider: 'gemini', model: payload.modelVersion || payload.model || base.model,
    input_tokens: n(usage.promptTokenCount), output_tokens: n(usage.candidatesTokenCount),
    cache_read_tokens: n(usage.cachedContentTokenCount), reasoning_tokens: n(usage.thoughtsTokenCount),
    total_tokens: n(usage.totalTokenCount), confidence_level: 'exact_request',
    request_id: payload.responseId || payload.id || base.request_id, source_kind: 'gemini_generate_content'
  });
}

function ollama(payload = {}, base = {}) {
  return mk(base, {
    provider: 'ollama', model: payload.model || base.model,
    input_tokens: n(payload.prompt_eval_count), output_tokens: n(payload.eval_count),
    confidence_level: 'exact_request', request_id: payload.id || base.request_id, source_kind: 'ollama_generate'
  });
}

function copilot(payload = {}, base = {}) {
  return mk(base, {
    provider: 'copilot', model: payload.model || base.model || 'copilot-pro',
    input_tokens: n(payload.input_tokens), output_tokens: n(payload.output_tokens),
    total_tokens: payload.total_tokens ?? (n(payload.input_tokens) + n(payload.output_tokens)),
    cost_usd: payload.cost_usd ?? payload.estimated_cost_usd,
    confidence_level: 'estimated', request_id: payload.request_id || base.request_id,
    source_kind: 'copilot_estimator', caveat_code: 'copilot_estimated_lane',
    caveat_detail: payload.caveat_detail ||
      'No exact Copilot per-request token API; values are estimated or manually synced.'
  });
}

function oaiShape(payload, base, provider, sourceKind) {
  const usage = payload.usage || {};
  const details = usage.prompt_tokens_details || {};
  return mk(base, {
    provider, model: payload.model || base.model,
    input_tokens: n(usage.prompt_tokens), output_tokens: n(usage.completion_tokens),
    cache_read_tokens: n(details.cached_tokens || usage.prompt_cache_hit_tokens),
    reasoning_tokens: n((usage.completion_tokens_details || {}).reasoning_tokens),
    total_tokens: n(usage.total_tokens), confidence_level: 'exact_request',
    request_id: payload.id || base.request_id, source_kind: sourceKind
  });
}
function openai(p = {}, b = {}) { return oaiShape(p, b, 'openai', 'openai_chat_completions'); }
function groq(p = {}, b = {}) { return oaiShape(p, b, 'groq', 'groq_chat_completions'); }
function cerebras(p = {}, b = {}) { return oaiShape(p, b, 'cerebras', 'cerebras_chat_completions'); }

module.exports = { anthropic, openrouter, litellm, gemini, ollama, copilot, openai, groq, cerebras };
