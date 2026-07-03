#!/usr/bin/env node
'use strict';
// prefix-cache.js (#3140, Epic #3137 T2): mark the stable system/instructions PREFIX of an Anthropic
// request with a cache_control breakpoint so paid calls prompt-prefix-cache the resident prefix
// (large $-per-call cut). Idempotent; graceful no-op on unexpected shapes (a cache miss is just a
// normal uncached call — no behavior change). Deterministic, local, $0. Reuses existing cache
// telemetry (token-provider-adapters cache_read_tokens) for the savings signal.

const BREAKPOINT = { type: 'ephemeral' };

/** Mark the stable system prefix of an Anthropic-style request as prompt-cacheable. Idempotent +
 * graceful (returns the request unchanged on an unexpected shape).
 * @param {object} request {system, messages}. @returns {object} the request with a cache breakpoint. */
function applyPrefixCache(request) {
  if (!request || typeof request !== 'object') return request;
  const { system } = request;
  if (typeof system === 'string' && system.length) {
    request.system = [{ type: 'text', text: system, cache_control: { ...BREAKPOINT } }];
    return request;
  }
  if (Array.isArray(system) && system.length) {
    const last = system[system.length - 1];
    if (last && typeof last === 'object' && !last.cache_control)
      last.cache_control = { ...BREAKPOINT };
    return request;
  }
  return request; // no stable system prefix to cache — graceful no-op
}

/** Report whether the request's stable prefix carries a cache breakpoint.
 * @param {object} request the request. @returns {object} {prefixCached, breakpoints}. */
function cacheCoverageReport(request) {
  const system = request && request.system;
  const blocks = Array.isArray(system) ? system : [];
  const breakpoints = blocks.filter((block) => block && block.cache_control).length;
  return { prefixCached: breakpoints > 0, breakpoints };
}

function main() {
  const demo = { system: 'STABLE GOVERNANCE PREFIX', messages: [{ role: 'user', content: 'hi' }] };
  applyPrefixCache(demo);
  process.stdout.write(`${JSON.stringify(cacheCoverageReport(demo))}\n`);
}

if (require.main === module) main();
module.exports = { applyPrefixCache, cacheCoverageReport };
