// tier: 3
// Rule-based fleet-dev eligibility router (#2794 P1-1 of Epic #2791; design D1, D6). Decides whether a
// FLEET-lane coding task may run as AUTONOMOUS fleet-development, or must escalate — by MEASURED capability
// (the model's code_dev_profile), not model size (D1). FAIL-CLOSED: default ineligible unless EVERY rule
// affirms (a missing/unmeasurable signal escalates, never silently runs on the fleet). Pure; the profile
// comes from model-routing-policy.json#code_dev_profiles (D6 currency-aware, refreshable). Does NOT touch
// existing lane/review/escalation routing — this is a distinct gate layered on top (AC4).
'use strict';

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
// OWN-property access only — a safety gate must not read inherited props, else a polluted Object.prototype
// (e.g. Object.prototype.pattern='known') could fail-OPEN by satisfying a rule on an empty input object.
const has = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);
const ownNum = (obj, key) => has(obj, key) && isNum(obj[key]);

// A profile is measurable only if it declares (as own props) the stable context window + a capability
// score. A malformed/absent profile is itself an escalation signal — capability can't be measured.
function isValidProfile(profile) {
  return ownNum(profile, 'context_stability_tokens') && ownNum(profile, 'swe_bench_verified');
}

// isFleetDevEligible(taskFeatures, profile, opts) -> { eligible, rationale }. Rules — ALL must affirm:
//   1 profile measurable · 2 known implementation pattern (novel → escalate) · 3 context fits the model's
//   stable window · 4 clear schema (ambiguous → escalate) · 5 measured capability >= the task's required
//   floor (opts.minCapability, default 0). The first failing rule names itself in the rationale (G8).
function isFleetDevEligible(taskFeatures, profile, opts) {
  // Reads are OWN-property only (has/ownNum) — prototype pollution can't fail-OPEN. `features` is coalesced
  // so null input can't crash the EAGERLY-built rule array (the loop returns on the first failing rule, but
  // all rule expressions evaluate when the array is constructed). profile is guarded by `measurable`.
  const features = taskFeatures || {};
  const minCapability = ownNum(opts, 'minCapability') ? opts.minCapability : 0;
  const measurable = isValidProfile(profile);
  const rules = [
    [measurable, 'no-or-malformed-profile → escalate (capability unmeasurable)'],
    [has(features, 'pattern') && features.pattern === 'known', 'novel-pattern → escalate'],
    [ownNum(features, 'contextTokens') && features.contextTokens >= 0,
      'context-size-missing-or-negative → escalate'], // distinct from too-large (G8)
    [measurable && features.contextTokens <= profile.context_stability_tokens,
      'context-exceeds-stable-window → escalate'],
    [has(features, 'schemaClarity') && features.schemaClarity === 'clear', 'ambiguous-schema → escalate'],
    [measurable && profile.swe_bench_verified >= minCapability, 'below-capability-floor → escalate'],
  ];
  for (const [affirmed, rationale] of rules) {
    if (!affirmed) return { eligible: false, rationale };
  }
  return { eligible: true, rationale: 'known-pattern + bounded-context + clear-schema + capability-met' };
}

// profileFor(modelId, policy) -> the model's code_dev_profile, else the meta default (conservative), else
// null. Own-property lookup (no prototype keys); never throws on a missing policy/section/model.
function profileFor(modelId, policy = {}) {
  const profiles = (policy && policy.code_dev_profiles) || {};
  if (modelId && Object.prototype.hasOwnProperty.call(profiles, modelId)) return profiles[modelId];
  return ((policy && policy.code_dev_profile_meta) || {}).default_profile || null;
}

module.exports = { isFleetDevEligible, profileFor, isValidProfile };
