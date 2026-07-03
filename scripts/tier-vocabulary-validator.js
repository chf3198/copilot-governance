#!/usr/bin/env node
'use strict';
// tier: 1
// tier-vocabulary-validator (Epic #2192 / #2739): rejects a wrapProviderCall on a
// fleet/ollama provider that passes a tier outside the canonical vocabulary - the
// P1-7 defect class (a mis-labeled tier silently mis-records cost data as a paid
// sticky-pick). The legal tier set is sourced from the canonical
// model-routing-policy.json (single source of truth, no local drift), plus the
// documented 'diagnostic' carve-out. Pure logic (unit-testable).

const fs = require('fs');
const path = require('path');

const FLEET_PROVIDERS = new Set(['ollama', 'fleet']);
const DIAGNOSTIC = 'diagnostic';
const POLICY_PATH = 'scripts/global/model-routing-policy.json';
const CALL_RE = /wrapProviderCall\(\s*['"](ollama|fleet)['"][\s\S]*?tier:\s*['"]([^'"]+)['"]/g;

function legalTiers(policy) {
  return new Set([...Object.keys((policy && policy.models) || {}), DIAGNOSTIC]);
}

function loadPolicy(repoRoot) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot || process.cwd(), POLICY_PATH), 'utf8'));
}

// validate a single (provider, tier) pair against the policy vocabulary.
function validateTier(provider, tier, policy) {
  if (!FLEET_PROVIDERS.has(String(provider || ''))) return { ok: true, violations: [] };
  if (tier == null || tier === '') return { ok: true, violations: [] };
  if (legalTiers(policy).has(tier)) return { ok: true, violations: [] };
  return { ok: false, violations: [{ rule: 'fleet-tier-not-in-vocabulary',
    detail: `wrapProviderCall('${provider}', ..., {tier:'${tier}'}) - '${tier}' is not in the canonical `
      + `tier vocabulary (${[...legalTiers(policy)].join('|')}); mis-labeled tier corrupts cost data (P1-7)` }] };
}

// scan source text for wrapProviderCall(fleet, {tier:'X'}) with an illegal X.
function scanSource(sourceText, policy) {
  const violations = [];
  const legal = legalTiers(policy);
  let match;
  CALL_RE.lastIndex = 0;
  while ((match = CALL_RE.exec(String(sourceText || ''))) !== null) {
    const [, provider, tier] = match;
    if (!legal.has(tier)) {
      violations.push({ rule: 'fleet-tier-not-in-vocabulary',
        detail: `${provider} call uses tier '${tier}' not in vocabulary (${[...legal].join('|')})` });
    }
  }
  return violations;
}

function validate(ctx = {}) {
  const policy = ctx.policy || loadPolicy(ctx.repoRoot);
  if (ctx.sourceText !== undefined) return { ok: scanSource(ctx.sourceText, policy).length === 0,
    violations: scanSource(ctx.sourceText, policy) };
  return validateTier(ctx.provider, ctx.tier, policy);
}

module.exports = { validate, validateTier, scanSource, legalTiers, loadPolicy, FLEET_PROVIDERS };
