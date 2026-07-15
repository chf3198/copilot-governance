'use strict';
// tier: 3
// Review privacy gate (#2934 / Epic #2926 C8, design D8). The pr-diff leaves the machine only on the
// external rungs (free-cloud / premium), so:
//   - fleet (local Ollama) is the privacy-preserving $0 DEFAULT — the diff never leaves the host, so
//     it is never redacted;
//   - before ANY external dispatch, log-redaction.js is applied to the diff;
//   - MEGINGJORD_REVIEW_NO_EXTERNAL=1 (or a sensitive-repo flag) SKIPS free-cloud entirely and allows
//     only fleet OR DPoP-premium (HAMR-contracted) — free providers have no data-handling contract
//     (G4 > G3 carve-out). Reuses scripts/global/log-redaction.js — no new redactor.

const NO_EXTERNAL_FLAG = 'MEGINGJORD_REVIEW_NO_EXTERNAL';
const EXTERNAL_TIERS = new Set(['free-cloud', 'premium']);

function isExternalTier(tier) { return EXTERNAL_TIERS.has(tier); }

function isRestricted(env, sensitive) {
  return sensitive === true || (env || process.env)[NO_EXTERNAL_FLAG] === '1';
}

/**
 * Decide whether a review dispatch to `tier` is allowed, and whether the diff must be redacted first.
 * @returns {{allowed, requiresRedaction, reason, redirect?}}
 */
function gateExternalDispatch({ tier = 'fleet', env, sensitive = false } = {}) {
  if (!isExternalTier(tier)) {
    return { allowed: true, requiresRedaction: false, reason: 'fleet-local-private' };
  }
  const restricted = isRestricted(env, sensitive);
  if (restricted && tier === 'free-cloud') {
    // Free providers have no data-handling contract — never send a sensitive diff there.
    return { allowed: false, requiresRedaction: false, reason: 'no-external-sensitive',
      redirect: 'fleet-only-or-dpop-premium' };
  }
  // premium under restriction is DPoP/HAMR-contracted; still redact before the diff leaves the host.
  return { allowed: true, requiresRedaction: true,
    reason: restricted ? 'dpop-premium-contracted' : 'external-redacted' };
}

/** Apply log-redaction to a diff before it leaves the machine. Returns { text, hits }. */
function redactForExternal(diff, deps = {}) {
  const redactString = deps.redactString || require('./log-redaction').redactString;
  return redactString(String(diff == null ? '' : diff));
}

/**
 * Full prepare step: gate + (redact iff external-allowed). The metric guarantee — external dispatch
 * on a sensitive/NO_EXTERNAL repo is 0 — holds because a blocked free-cloud dispatch returns no payload.
 * @returns {{allowed, tier, payload: string|null, redactionHits, reason, redirect?}}
 */
function prepareReviewDispatch({ diff = '', tier = 'fleet', env, sensitive = false } = {}, deps = {}) {
  const gate = gateExternalDispatch({ tier, env, sensitive });
  if (!gate.allowed) {
    return { allowed: false, tier, payload: null, redactionHits: [], reason: gate.reason, redirect: gate.redirect };
  }
  if (!gate.requiresRedaction) {
    return { allowed: true, tier, payload: String(diff), redactionHits: [], reason: gate.reason };
  }
  const redacted = redactForExternal(diff, deps);
  return { allowed: true, tier, payload: redacted.text, redactionHits: redacted.hits || [], reason: gate.reason };
}

module.exports = {
  isExternalTier, isRestricted, gateExternalDispatch, redactForExternal, prepareReviewDispatch,
  NO_EXTERNAL_FLAG, EXTERNAL_TIERS,
};
