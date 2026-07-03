#!/usr/bin/env node
// tier: 3
// sticky-route.js — HAMR Wave 4 child 3 (#926).
// Maps tier → preferred provider with substrate-health.json fallback.
// Sticky = same provider across multi-turn conversations to maximize cache hits.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SUBSTRATE_HEALTH_FILE = path.join(os.homedir(), '.megingjord', 'substrate-health.json');

// Tier → preferred-provider sequence per v3.2 §R3 capability matrix.
const TIER_PROVIDER_MAP = {
  free:        ['ollama', 'gemini', 'groq', 'cerebras'],
  fleet:       ['groq', 'cerebras', 'gemini', 'openrouter'],
  'fleet-local': ['ollama'],
  haiku:       ['anthropic', 'openrouter'],
  premium:     ['anthropic', 'openai', 'openrouter'],
};

function readSubstrateHealth(file = SUBSTRATE_HEALTH_FILE) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function isProviderHealthy(health, provider) {
  if (!health?.providers) return true;
  const state = health.providers[provider];
  if (!state) return true;
  return state.available !== false && !state.rate_limited;
}

/** Pick sticky provider for tier given conversation context + substrate health.
 * Sticky guarantee: returns previousProvider if it still appears in the tier list AND is healthy.
 * Otherwise returns first healthy provider from the tier list.
 * @param {string} tier - 'free' | 'fleet' | 'haiku' | 'premium'.
 * @param {object} [opts] - { previousProvider, substrateHealth, tierMap }.
 * @returns {{provider: string|null, sticky: boolean, reason: string}} Routing decision.
 */
function pickStickyProvider(tier, opts = {}) {
  const tierMap = opts.tierMap ?? TIER_PROVIDER_MAP;
  const candidates = tierMap[tier] || [];
  const health = opts.substrateHealth ?? readSubstrateHealth();
  const prev = opts.previousProvider;
  if (prev && candidates.includes(prev) && isProviderHealthy(health, prev)) {
    return { provider: prev, sticky: true, reason: `sticky_${prev}_for_tier_${tier}` };
  }
  for (const candidate of candidates) {
    if (isProviderHealthy(health, candidate)) {
      return { provider: candidate, sticky: false,
        reason: prev ? `fallback_from_${prev}_to_${candidate}` : `first_pick_${candidate}_for_tier_${tier}` };
    }
  }
  return { provider: null, sticky: false, reason: `no_healthy_provider_for_tier_${tier}` };
}

if (require.main === module) {
  const tier = process.argv[2] || 'free';
  const previousProvider = process.argv[3];
  console.log(JSON.stringify(pickStickyProvider(tier, { previousProvider }), null, 2));
}

module.exports = { pickStickyProvider, readSubstrateHealth, TIER_PROVIDER_MAP };
