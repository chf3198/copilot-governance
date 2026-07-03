#!/usr/bin/env node
// stress-evidence-check (#1875 Phase 3) — verifies stress evidence when
// MANAGER_HANDOFF declares test_strategy includes 'stress-test'.
// Composable strategy: 'tdd-pyramid+stress-test', 'eval-harness+stress-test', etc.
'use strict';

const STRESS_STRATEGY = 'stress-test';
const STRESS_SPEC_PATTERN = /^tests\/stress-[^/]+\.spec\.js$/;
const NPM_INVOCATION = /\bnpm\s+run\s+stress:[a-z][a-z0-9_-]+/i;

function parseStrategies(field) {
  if (!field) return [];
  return String(field).split(/[+,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

function declaresStress(managerHandoffBody) {
  const match = String(managerHandoffBody || '').match(/test_strategy\s*:\s*([^\n]+)/i);
  if (!match) return false;
  return parseStrategies(match[1]).includes(STRESS_STRATEGY);
}

function hasStressSpecInDiff(prFiles) {
  return (prFiles || []).some(file => STRESS_SPEC_PATTERN.test(String(file)));
}

function hasNpmInvocationInTrail(handoffs) {
  for (const body of handoffs || []) {
    if (NPM_INVOCATION.test(String(body))) return true;
  }
  return false;
}

function evaluate(input) {
  const managerBody = String(input.managerHandoff || '');
  if (!declaresStress(managerBody)) {
    return { ok: true, applicable: false, reason: 'stress-strategy-not-declared' };
  }
  const specInDiff = hasStressSpecInDiff(input.prFiles);
  const invocationInTrail = hasNpmInvocationInTrail([input.collabHandoff, input.adminHandoff,
    input.consultantCloseout]);
  if (specInDiff || invocationInTrail) {
    return { ok: true, applicable: true,
      evidence: specInDiff ? 'stress-spec-in-diff' : 'npm-run-stress-in-handoff' };
  }
  return { ok: false, applicable: true, rule: 'stress-evidence-missing',
    detail: 'test_strategy declares stress-test but neither tests/stress-*.spec.js in PR diff ' +
      'nor `npm run stress:*` cited in COLLABORATOR/ADMIN/CONSULTANT artifact. ' +
      'See instructions/test-methodology-matrix.instructions.md and Epic #1875.' };
}

function advisoryComment(result, ticket) {
  if (result.ok || !result.applicable) return null;
  return [
    '<!-- stress-evidence-check -->',
    `## ⚠ Stress Evidence Missing (Epic #1875)`,
    '',
    `Issue #${ticket} declared \`test_strategy: ...stress-test...\` but no stress evidence found.`,
    '',
    'Provide ONE of:',
    '- `tests/stress-<name>.spec.js` file in PR diff (must assert ≥1 chaos path AND ≥1 p99 latency budget), OR',
    '- `npm run stress:<suite>` invocation cited in COLLABORATOR_HANDOFF Pre-handoff verification.',
    '',
    'See `instructions/test-methodology-matrix.instructions.md` (Stress applicability section).',
  ].join('\n');
}

module.exports = { evaluate, advisoryComment, declaresStress, hasStressSpecInDiff,
  hasNpmInvocationInTrail, parseStrategies,
  STRESS_STRATEGY, STRESS_SPEC_PATTERN, NPM_INVOCATION };
