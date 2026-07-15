'use strict';
// tier: 3
// Stakes-tiered review-model selector (#2931 / Epic #2926 C5, design D5).
// Routes a code review to the cheapest ADEQUATE reviewer by stakes, enforcing the cross-family
// invariant (reviewer model family != author family):
//   routine  (docs/tests/config/dashboard) -> qwen2.5-coder:32b   fleet      ($0)   — G3 default
//   standard (general code)                 -> gemini-flash        free-cloud ($0)   — G3 + cross-family
//   high     (auth/crypto/IAM/gov-gates)    -> gemini-pro          premium    (paid) — G2 where it matters
// High-stakes surface mirrors the #2798 fleet-dev-deny-paths protected paths. Pure functions only.

// High-blast-radius path surface (auth, crypto/keys, IAM, governance gates + pretool_guard, deny-list).
// Boundary-anchored so 'monkey'/'gateway' (the fleet gateway, NOT high-stakes) do NOT false-positive,
// while api-key/keys/encryption/governance/sso DO match (fail-OPEN gaps closed per #2931 cross-family review).
const HIGH_STAKES_RE = /(^|\/|[._-])(auth|oauth|sso|jwt|crypto|encrypt(ion)?|secret|token|password|passwd|credential|keys?|keyring|keystore|keychain|cert(ificate)?|iam|signing|sign-?key|deny-?(list|paths)|pretool_guard|canonical_main_enforcer|governance|gate|permission)s?([._/-]|$)/i;
// Routine surface: docs, tests/fixtures, config, dashboard — no cross-family-quality pressure.
const ROUTINE_RE = /(\.(md|txt|json|ya?ml)$)|(^|\/)(docs?|tests?|fixtures?|dashboard|config)\//i;

function classifyStakes({ paths = [], labels = [] } = {}) {
  const all = [...paths, ...labels.map((l) => `label:${l}`)];
  if (all.some((p) => HIGH_STAKES_RE.test(String(p)) || /high-?stakes|security|area:hooks/i.test(String(p)))) return 'high';
  if (paths.length > 0 && paths.every((p) => ROUTINE_RE.test(String(p)))) return 'routine';
  return 'standard';
}

// Per-tier primary reviewer + a cross-family ALTERNATE used when the primary's family == author's.
const TIERS = Object.freeze({
  routine: {
    primary: { tier: 'fleet', model: 'qwen2.5-coder:32b', provider: 'ollama', family: 'alibaba' },
    alternate: { tier: 'free-cloud', model: 'gemini-flash', provider: 'google-ai-studio', family: 'google' },
  },
  standard: {
    primary: { tier: 'free-cloud', model: 'gemini-flash', provider: 'google-ai-studio', family: 'google' },
    alternate: { tier: 'fleet', model: 'qwen2.5-coder:32b', provider: 'ollama', family: 'alibaba' },
  },
  high: {
    primary: { tier: 'premium', model: 'gemini-pro', provider: 'google-ai-studio', family: 'google' },
    alternate: { tier: 'premium', model: 'claude-opus', provider: 'anthropic', family: 'anthropic' },
  },
});

function selectReviewModel({ stakes = 'standard', authorFamily = 'anthropic' } = {}) {
  const tier = TIERS[stakes] || TIERS.standard;
  // Cross-family invariant: never let the reviewer share the author's model family.
  const choice = tier.primary.family !== authorFamily ? tier.primary : tier.alternate;
  if (choice.family === authorFamily) {
    throw new Error(`review-stakes-router: no cross-family reviewer for author family '${authorFamily}' at stakes '${stakes}'`);
  }
  return { ...choice, stakes, crossFamily: true };
}

/** Convenience: classify + select in one call. */
function routeReview({ paths, labels, authorFamily } = {}) {
  const stakes = classifyStakes({ paths, labels });
  return selectReviewModel({ stakes, authorFamily });
}

module.exports = { classifyStakes, selectReviewModel, routeReview, TIERS, HIGH_STAKES_RE, ROUTINE_RE };
