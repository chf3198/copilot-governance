#!/usr/bin/env node
'use strict';
// #1236 / #2305 — single source of truth for test_strategy enum.
// Consumed by test-evidence-validator.js, manager-handoff.js, and drift-detection spec.
// Adding a new strategy here requires updating instructions/test-methodology-matrix.instructions.md.
//
// Composability rule (Epic #1875): stress-test MAY appear as the second strategy
// via '+' separator (e.g. 'tdd-pyramid+stress-test'). It is a valid standalone enum
// value AND valid as a composed suffix. See isValidStrategy() below.

const ALLOWED_STRATEGIES = [
  'tdd-pyramid', 'tdd-trophy', 'contract-test', 'golden-file',
  'eval-harness', 'visual-regression', 'drift-lint', 'peer-review',
  'manual-verify', 'stress-test', 'none',
];

const NONE_PERMITTED_LANES = [
  'lane:trivial', 'lane:docs-research', 'lane:docs-only',
  'lane:research', 'lane:config-only', 'lane:no-code-remediation',
];

const PEER_REVIEW_RUBRIC_THRESHOLD = 7;

/**
 * Returns true when the declared test_strategy value is valid.
 * Accepts:
 *   - any single value in ALLOWED_STRATEGIES
 *   - a '+'-composed pair where both parts are in ALLOWED_STRATEGIES
 *     and the second part is 'stress-test' (per Epic #1875 composability rule)
 */
function isValidStrategy(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (ALLOWED_STRATEGIES.includes(trimmed)) return true;
  if (trimmed.includes('+')) {
    const parts = trimmed.split('+').map(p => p.trim());
    return (
      parts.length === 2 &&
      ALLOWED_STRATEGIES.includes(parts[0]) &&
      parts[1] === 'stress-test'
    );
  }
  return false;
}

module.exports = {
  ALLOWED_STRATEGIES,
  NONE_PERMITTED_LANES,
  PEER_REVIEW_RUBRIC_THRESHOLD,
  isValidStrategy,
};
