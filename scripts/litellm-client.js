#!/usr/bin/env node
'use strict';
// tier: 3
// Unified fleet client: LiteLLM gateway (preferred) → direct Ollama (fallback).
// Activates when LITELLM_URL env var or fleet-config OpenClaw URL resolves.
// Uses named LiteLLM route groups to trigger fallback chain from litellm-config.yaml.

const { chatComplete: ollamaChat, healthCheck: ollamaHealth } = require('./ollama-direct');
const { getOpenClawURL } = require('./fleet-config');
const { appendCacheStat } = require('./cache-stats-emit');
// #2929 (Epic #2926 C3): probe-first routing so a down/slow gateway skips the 120s hang.
const { dispatchFleet: dispatchFleetCore } = require('./fleet-backend-select');

function emitCacheStatSafe(provider, model, usage) {
  try {
    if (!usage) return;
    const d = usage.prompt_tokens_details || {};
    appendCacheStat({ provider, model,
      cache_read_tokens: Number(d.cached_tokens || usage.prompt_cache_hit_tokens || 0),
      input_tokens: Number(usage.prompt_tokens || 0),
      output_tokens: Number(usage.completion_tokens || 0) });
  } catch { /* never let stats emission break the call */ }
}

// Map Ollama model IDs to LiteLLM named groups (triggers fallback chain).
const NAMED_GROUPS = {
  'qwen2.5-coder:1.5b': 'fleet-primary',
  'starcoder2:3b': 'fleet-fast',
  'qwen2.5-coder:7b': 'fleet-quality',
  'qwen2.5:7b-instruct': 'fleet-fallback'
};

function getLiteLLMUrl() {
  return process.env.LITELLM_URL || getOpenClawURL();
}

async function litellmChat(prompt, opts = {}) {
  const url = opts.url || getLiteLLMUrl();
  if (!url) return { ok: false, error: 'no_litellm_url' };
  const model = opts.litellmModel || NAMED_GROUPS[opts.model] || 'fleet-primary';
  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: opts.maxTokens || 512,
    // #3484: forward keep_alive so the fleet keeps the hot model resident (LiteLLM passes it through).
    ...(opts.keepAlive ? { keep_alive: opts.keepAlive } : {}),
  });
  try {
    const res = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-litellm-timeout': '120' },
      body,
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) return { ok: false, error: 'empty_response' };
    if (!opts.disableCacheEmit) emitCacheStatSafe('litellm', data.model || model, data.usage);
    return {
      ok: true,
      content,
      model: data.model || model,
      backend: 'litellm',
      usage: data.usage || null,
      prompt_tokens: Number(data.usage?.prompt_tokens || 0),
      completion_tokens: Number(data.usage?.completion_tokens || 0),
      total_tokens: Number(data.usage?.total_tokens || 0),
    };
  } catch (e) {
    return { ok: false, error: e.message || 'litellm_error' };
  }
}

async function chatComplete(prompt, opts = {}) {
  const url = getLiteLLMUrl();
  if (url) {
    if (opts.skipHamrWrap) {
      const direct = await litellmChat(prompt, { ...opts, url });
      if (direct.ok) return direct;
    } else {
      try {
        const { wrapProviderCall } = require('./hamr-provider-wrapper');
        const wrapped = await wrapProviderCall('litellm', async () => {
          const inner = await litellmChat(prompt, { ...opts, url, disableCacheEmit: true });
          if (!inner.ok) throw new Error(inner.error || 'litellm_failed');
          return inner;
        }, { tier: opts.tier });
        if (wrapped.ok) return wrapped.value;
      } catch { /* fall through to ollama */ }
    }
  }
  return ollamaChat(prompt, opts);
}

async function healthCheck() {
  const url = getLiteLLMUrl();
  if (url) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return { ok: true, backend: 'litellm', url };
    } catch { /* fall through to direct Ollama */ }
  }
  const h = await ollamaHealth();
  return { ...h, backend: 'ollama' };
}

// cacheHeaders: native cache-control hints (#926). C9 (#1000): Anthropic 5min default + 1h opt-in.
const DEFAULT_CACHE_TTL_SECONDS = 300;
const EXTENDED_CACHE_TTL_SECONDS = 3600;
const ANTHROPIC_BASE_BETA = 'prompt-caching-2024-07-31';
const ANTHROPIC_EXTENDED_BETA = 'prompt-caching-2024-07-31,extended-cache-ttl-2025-04-11';

function cacheHeaders(provider, opts = {}) {
  const useExtended = opts.extendedTtl === true;
  const ttl = opts.ttlSeconds ?? (useExtended ? EXTENDED_CACHE_TTL_SECONDS : DEFAULT_CACHE_TTL_SECONDS);
  switch (provider) {
    case 'anthropic':
      return { headers: { 'anthropic-beta': useExtended ? ANTHROPIC_EXTENDED_BETA : ANTHROPIC_BASE_BETA },
        bodyExtras: { extra_headers: { 'cache-control': `max-age=${ttl}` } } };
    case 'gemini':
      return { headers: {}, bodyExtras: { cachedContent: opts.cacheKey || null, ttl: `${ttl}s` } };
    case 'groq': case 'cerebras': case 'openai':
      return { headers: { 'x-cache-control': `max-age=${ttl}` }, bodyExtras: {} };
    default: return { headers: {}, bodyExtras: {} };
  }
}

// #2929 C3: probe-first fleet dispatch wired with real deps. Routes via the fast health probe
// FIRST, so a down/slow LiteLLM gateway falls straight to direct Ollama (no 120s hang) and the
// switch is visible on stderr + telemetry. Additive — chatComplete/healthCheck are unchanged.
function recordFleetBackendSafe(event) {
  try {
    require('./model-routing-telemetry').recordTelemetry({
      lane: 'fleet', model: event.backend, outcome: event.fallback ? 'fallback' : 'ok',
      escalation: null, escalation_reason: event.fallback_reason || null, execute: true,
    });
  } catch { /* telemetry is best-effort; never block a dispatch on a logging miss */ }
}

async function dispatchFleet(prompt, opts = {}) {
  return dispatchFleetCore(prompt, opts, {
    healthCheck,
    litellmChat: (p, o) => litellmChat(p, { ...o, url: getLiteLLMUrl() }),
    ollamaChat,
    write: (line) => process.stderr.write(line),
    record: recordFleetBackendSafe,
  });
}

module.exports = { chatComplete, healthCheck, getLiteLLMUrl, cacheHeaders, dispatchFleet };
