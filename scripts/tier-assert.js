#!/usr/bin/env node
'use strict';
// tier: 0
// tier-assert (Epic #2398 AC6): assert a feature's required resource tier against
// the operator-asserted MEGINGJORD_MINIMUM_TIER. Fails closed when a feature needs
// a higher tier than the operator guarantees; advisory when the var is unset.
// Taxonomy: instructions/resource-tier-portability.instructions.md (tiers 0-5).

const MIN_TIER = 0;
const MAX_TIER = 5;

function readMinimumTier(env = process.env) {
  const raw = (env.MEGINGJORD_MINIMUM_TIER || '').trim();
  if (raw === '') return null; // unset → advisory mode
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < MIN_TIER || parsed > MAX_TIER) return null;
  return parsed;
}

function inRange(tier) {
  return Number.isInteger(tier) && tier >= MIN_TIER && tier <= MAX_TIER;
}

// Assert that `requiredTier` is satisfiable given the operator's asserted minimum.
// Returns { ok, asserted, required, action, message }.
//   action: 'ok' | 'advisory' | 'fallback'
function assertTier(requiredTier, opts = {}) {
  const env = opts.env || process.env;
  const feature = opts.feature || 'feature';
  if (!inRange(requiredTier)) {
    throw new RangeError(`tier-assert: requiredTier must be ${MIN_TIER}-${MAX_TIER}, got ${requiredTier}`);
  }
  const asserted = readMinimumTier(env);
  if (asserted === null) {
    return { ok: true, asserted: null, required: requiredTier, action: 'advisory',
      message: `tier-assert: MEGINGJORD_MINIMUM_TIER unset; ${feature} (tier ${requiredTier}) not gated.` };
  }
  if (requiredTier <= asserted) {
    return { ok: true, asserted, required: requiredTier, action: 'ok',
      message: `tier-assert: ${feature} (tier ${requiredTier}) within asserted tier ${asserted}.` };
  }
  return { ok: false, asserted, required: requiredTier, action: 'fallback',
    message: `tier-assert: ${feature} requires tier ${requiredTier} but operator asserted MEGINGJORD_MINIMUM_TIER=${asserted}; take the Tier-${asserted}-or-lower fallback (see docs/howto/resource-tier-feature-matrix.md).` };
}

if (require.main === module) {
  const tierArg = Number(process.argv[2]);
  const result = assertTier(Number.isFinite(tierArg) ? tierArg : 0, { feature: process.argv[3] || 'cli' });
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 3);
}

module.exports = { readMinimumTier, assertTier, MIN_TIER, MAX_TIER };
