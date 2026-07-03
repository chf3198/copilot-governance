#!/usr/bin/env node
'use strict';
// anneal-pattern-catalog.js — AC3 (#1133)
// Canonical v1 pattern catalog: 8 known recurring workflow failure patterns.
// Each entry: pattern_id, description, detection_signature, threshold, remediation.

const PATTERNS = [
  {
    pattern_id: 'changelog-conflict',
    description: 'Concurrent appends to CHANGELOG.md at the same insertion point',
    detection_signature: /CONFLICT.*CHANGELOG\.md/i,
    threshold: { occurrences: 2, window_days: 7 },
    remediation: 'Switch to per-ticket changelog fragments (closes #1132 pattern)',
  },
  {
    pattern_id: 'branch-name-rejection',
    description: 'Branch name fails ruleset validation (e.g. docs/<N> not allowed)',
    detection_signature: /branch.*not allowed|invalid branch name|protected branch/i,
    threshold: { occurrences: 2, window_days: 14 },
    remediation: 'Update branch-name conventions doc; add pre-push hook validation',
  },
  {
    pattern_id: 'signature-variance',
    description: 'Operator handle does not match registry alias in Team&Model provenance',
    detection_signature: /signature.*mismatch|alias.*not found|provenance.*invalid/i,
    threshold: { occurrences: 2, window_days: 14 },
    remediation: 'Normalize alias in team-model-signatures.json; add pre-commit lint',
  },
  {
    pattern_id: 'evidence-completeness-race',
    description: 'PR created before COLLABORATOR_HANDOFF comment aged (60s race)',
    detection_signature: /evidence.*incomplete|handoff.*missing|collaborator.*timeout/i,
    threshold: { occurrences: 2, window_days: 14 },
    remediation: 'Add 90s wait gate in collaborator role script before PR creation',
  },
  {
    pattern_id: 'admin-signer-non-independence',
    description: 'Admin signer alias matches collaborator alias (non-independent sign)',
    detection_signature: /admin.*same as.*collaborator|non-independent.*sign/i,
    threshold: { occurrences: 1, window_days: 30 },
    remediation: 'Enforce distinct aliases for collaborator/admin in governance-audit',
  },
  {
    pattern_id: 'pre-commit-amend',
    description: 'Pre-commit hook failure fixed via --amend instead of new commit',
    detection_signature: /pre-commit.*failed|hook.*exit 1.*amend/i,
    threshold: { occurrences: 3, window_days: 7 },
    remediation: 'Add pre-commit bypass audit log; block amend-after-push in ruleset',
  },
  {
    pattern_id: 'file-over-100-lines',
    description: 'Same file repeatedly exceeds 100-line lint limit across PRs',
    detection_signature: /file.*exceeds.*100 lines|lint.*line.count/i,
    threshold: { occurrences: 2, window_days: 30 },
    remediation: 'Extract helper module; add per-file waiver with expiry in lint-baseline',
  },
  {
    pattern_id: 'worktree-governance-violation',
    description: 'Multiple agents share one live checkout or branch conflict',
    detection_signature: /worktree.*collision|concurrent.*checkout|branch.*conflict/i,
    threshold: { occurrences: 1, window_days: 14 },
    remediation: 'Enforce one-worktree-per-agent; quarantine rescue worktree on collision',
  },
  {
    pattern_id: 'phase0-complete-no-phase1',
    description: 'Research-first Epic reached green-complete Phase-0 but has zero Phase-1 children',
    detection_signature: /phase0-complete-no-phase1|phase-?0.*green.*no.*phase-?1/i,
    threshold: { occurrences: 1, window_days: 30 },
    remediation: 'Auto-materialize a Phase-1 seed child; closure-block guard fails Epic close until present (Epic #2678)',
  },
];

function getPattern(id) {
  return PATTERNS.find(p => p.pattern_id === id) || null;
}

function matchEvent(text) {
  for (const p of PATTERNS) {
    if (p.detection_signature.test(text)) return p;
  }
  return null;
}

if (require.main === module) {
  console.log(JSON.stringify(PATTERNS.map(p => ({
    ...p, detection_signature: p.detection_signature.toString(),
  })), null, 2));
}

module.exports = { PATTERNS, getPattern, matchEvent };
