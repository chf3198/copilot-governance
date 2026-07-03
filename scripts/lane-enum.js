'use strict';
// tier: 2
// lane-enum.js — single source-of-truth for canonical lane labels.
// Refs #2302 / Epic #2295 P1.1 — reconciles inter-validator LIGHTWEIGHT drift.
// CommonJS exports for cross-runtime portability (Node 14+, Cloudflare Workers).

/**
 * Severity tiers for lane labels.
 * 'full'        = 4-role baton (code-change)
 * 'lightweight' = reduced baton; COLLABORATOR_HANDOFF and/or ADMIN_HANDOFF N/A
 * 'issue-only'  = no repo edits; Manager->Consultant only
 */

/** @type {ReadonlyArray<string>} Canonical set of lane labels. */
const LANES = Object.freeze([
  'lane:code-change',
  'lane:docs-research',
  'lane:docs-only',
  'lane:config-only',
  'lane:trivial',
  'lane:research',
  'lane:no-code-remediation',
]);

/**
 * Per-lane severity metadata.
 * @type {Record<string, {severity: string, collab: boolean, admin: boolean}>}
 */
const LANE_META = Object.freeze({
  'lane:code-change':         { severity: 'full',       collab: true,  admin: true  },
  'lane:docs-research':       { severity: 'lightweight', collab: false, admin: false },
  'lane:docs-only':           { severity: 'lightweight', collab: false, admin: false },
  'lane:config-only':         { severity: 'lightweight', collab: false, admin: true  },
  'lane:trivial':             { severity: 'lightweight', collab: false, admin: false },
  'lane:research':            { severity: 'lightweight', collab: false, admin: false },
  'lane:no-code-remediation': { severity: 'issue-only', collab: false, admin: false },
});

/**
 * LIGHTWEIGHT — lanes where COLLABORATOR_HANDOFF is N/A and/or skipped.
 * Union of all prior per-validator sets to maximise backward compatibility.
 *
 * Carve-out registry (AC4):
 *   lane:no-code-remediation — defined in instructions but absent from GitHub labels
 *   as of 2026-05-27. Label creation tracked in Epic #2295. Included in LANES for
 *   forward-compat; excluded from LIGHTWEIGHT because it is issue-only, not merely
 *   lightweight. Validators skip on isLightweight() OR laneSeverity()==='issue-only'.
 */
const LIGHTWEIGHT = Object.freeze([
  'lane:docs-research',
  'lane:docs-only',
  'lane:config-only',
  'lane:trivial',
  'lane:research',
]);

/** @type {ReadonlySet<string>} Set form of LIGHTWEIGHT for O(1) lookup. */
const LIGHTWEIGHT_SET = new Set(LIGHTWEIGHT);

/**
 * LIGHTWEIGHT_LANES — Set alias used by merge-evidence validators.
 * Identical to LIGHTWEIGHT_SET for backward compat.
 * @type {ReadonlySet<string>}
 */
const LIGHTWEIGHT_LANES = LIGHTWEIGHT_SET;

/**
 * Returns true if the given lane label is in the lightweight set.
 * @param {string} lane
 * @returns {boolean}
 */
function isLightweight(lane) {
  return LIGHTWEIGHT_SET.has(lane);
}

/**
 * Returns true if the lane requires no collaborator or admin handoff.
 * Covers both lightweight lanes and issue-only lanes (no-code-remediation).
 * @param {string} lane
 * @returns {boolean}
 */
function skipHandoff(lane) {
  const meta = LANE_META[lane];
  return meta ? (!meta.collab && !meta.admin) : false;
}

/**
 * Returns the severity tier for a lane label, or null if unknown.
 * @param {string} lane
 * @returns {string|null}
 */
function laneSeverity(lane) {
  return LANE_META[lane] ? LANE_META[lane].severity : null;
}

module.exports = {
  LANES,
  LANE_META,
  LIGHTWEIGHT,
  LIGHTWEIGHT_SET,
  LIGHTWEIGHT_LANES,
  isLightweight,
  skipHandoff,
  laneSeverity,
};
