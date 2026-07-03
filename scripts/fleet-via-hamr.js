#!/usr/bin/env node
'use strict';
// tier: 3
/* fleet-via-hamr — HAMR-wrapped fleet (Ollama) call shim.
 *
 * Per #1149 / Epic #1130 / consensus extract D-1148-001. Closes the 0%
 * fleet utilization gap: every fleet call routed through wrapProviderCall
 * with cacheHeaders + telemetry emission + spillover hint.
 *
 * Caller signature is INTENT-based — HAMR resolves host from devices.json
 * and registry. Production callers should use this; never call Ollama HTTP
 * directly.
 *
 * Diagnostic-tier carve-out (per #1155 D-1148-004): pass tier='diagnostic'
 * to mark probes/IT-curls; production utilization metric will exclude them.
 */

const { wrapProviderCall } = require('./hamr-provider-wrapper');

const FLEET_NODES = {
  'fleet-fast': { host: '100.91.113.16', port: 11434, default_model: 'starcoder2:3b' },
  'fleet-quality': { host: '100.91.113.16', port: 11434, default_model: 'qwen2.5-coder:7b-instruct-q3_K_S' },
  'fleet-standard': { host: '100.78.22.13', port: 11434, default_model: 'qwen2.5-coder:1.5b' },
  'fleet-large': { host: '100.91.113.16', port: 11434, default_model: 'qwen2.5-coder:32b' },
};

function resolveNode(tier) {
  return FLEET_NODES[tier] || FLEET_NODES['fleet-standard'];
}

/**
 * Make a HAMR-wrapped fleet inference call.
 *
 * @param {object} req - { tier, model, prompt, system, options }
 * @param {object} [opts] - { tier (override), diagnostic, hostOverride }
 * @returns {Promise<{ok, value, sticky, spillover}>}
 */
async function fleetCall(req = {}, opts = {}) {
  const tier = opts.tier || req.tier || 'fleet-standard';
  const node = opts.hostOverride
    ? { host: opts.hostOverride, port: 11434, default_model: req.model || 'qwen2.5-coder:1.5b' }
    : resolveNode(tier);
  const model = req.model || node.default_model;
  const wrappedTier = opts.diagnostic ? 'diagnostic' : tier;
  return wrapProviderCall('ollama', async () => {
    const body = {
      model,
      prompt: req.prompt || '',
      system: req.system,
      options: req.options || {},
      stream: false,
    };
    const url = `http://${node.host}:${node.port}/api/generate`;
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), opts.timeoutMs || 240000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const data = await res.json();
      return { status: res.status, data, headers: res.headers };
    } finally { clearTimeout(timeout); }
  }, { tier: wrappedTier });
}

if (require.main === module) {
  console.log(JSON.stringify({ exports: ['fleetCall', 'FLEET_NODES'], hamr_wrapped: true }));
}

module.exports = { fleetCall, resolveNode, FLEET_NODES };
