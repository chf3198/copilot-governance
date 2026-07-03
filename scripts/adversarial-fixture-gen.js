'use strict';
// tier: 3
// adversarial-fixture-gen (#1771 Child 3.2) — generates synthetic adversarial
// fixtures for replay-based eval gates. Each fixture exercises a specific
// rotation rule or pre-merge-review trigger with known-expected outcome.

const ROTATION_FIXTURES = [
  { name: 'rule-2-fail-same-team', records: { manager: 'claude-code:opus@anthropic', collaborator: 'claude-code:opus@anthropic', admin: 'claude-code:opus@anthropic' }, expect_violation: 'rule_2_admin_diversity' },
  { name: 'rule-2-pass-different-team', records: { manager: 'claude-code:opus@anthropic', collaborator: 'claude-code:opus@anthropic', admin: 'codex:gpt-5@openai' }, expect_violation: null },
  { name: 'rule-3-fail-consultant-matches-manager', records: { manager: 'claude-code:opus@anthropic', collaborator: 'codex:gpt-5@openai', admin: 'copilot:sonnet@github-copilot', consultant: 'claude-code:opus@anthropic' }, expect_violation: 'rule_3_consultant_independent' },
  { name: 'rule-3-pass-fully-independent', records: { manager: 'claude-code:opus@anthropic', collaborator: 'codex:gpt-5@openai', admin: 'copilot:sonnet@github-copilot', consultant: 'openclaw:qwen@ollama' }, expect_violation: null },
  { name: 'rule-1-fail-self-check-same-team', records: { implementation: 'claude-code:opus@anthropic', collaborator_self_check: 'claude-code:sonnet@anthropic' }, expect_violation: 'rule_1_collab_self_review' },
  { name: 'rule-1-pass-cross-family', records: { implementation: 'claude-code:opus@anthropic', collaborator_self_check: 'codex:gpt-5@openai' }, expect_violation: null },
  { name: 'single-model-fleet-skip', operator_mode: 'single-model-fleet', records: { manager: 'claude-code:opus@anthropic', collaborator: 'claude-code:opus@anthropic', admin: 'claude-code:opus@anthropic', consultant: 'claude-code:opus@anthropic' }, expect_violation: null, expect_skip: 'single-model-fleet' },
  { name: 'v2-waiver-label-skip', labels: ['rotation-required-waived'], records: { manager: 'claude-code:opus@anthropic', collaborator: 'claude-code:opus@anthropic', admin: 'claude-code:opus@anthropic' }, expect_violation: null, expect_skip: 'v2-waived' },
];

const PRE_MERGE_FIXTURES = [
  { name: 'auth-code-change-high', files: ['src/middleware/auth.js'], expect_trigger: 'auth-code-change', expect_severity: 'high' },
  { name: 'db-schema-migration-high', files: ['migrations/2026-05-16-add-users.sql'], expect_trigger: 'db-schema-migration', expect_severity: 'high' },
  { name: 'new-dep-package-lock-high', files: ['package-lock.json'], diff_pattern: 'new-package-entry', expect_trigger: 'new-external-dependency', expect_severity: 'high' },
  { name: 'patch-version-bump-low', files: ['package-lock.json'], diff_pattern: 'version-bump-only', expect_trigger: 'dependency-version-bump', expect_severity: 'medium' },
  { name: 'secret-path-high', files: ['.env.production'], expect_trigger: 'secret-credential-path', expect_severity: 'high' },
  { name: 'workflow-yaml-actions-change-high', files: ['.github/workflows/deploy.yml'], expect_trigger: 'workflow-yaml-actions-change', expect_severity: 'high' },
  { name: 'workflow-yaml-trivial-low', files: ['.github/workflows/deploy.yml'], diff_pattern: 'only-comment-whitespace', expect_trigger: 'workflow-yaml-trivial', expect_severity: 'low' },
  { name: 'crypto-primitive-high', files: ['src/sign.js'], content_pattern: 'ed25519.sign', expect_trigger: 'cryptographic-primitive', expect_severity: 'high' },
  { name: 'permission-scope-expansion-high', files: ['.github/workflows/release.yml'], diff_pattern: 'permissions-block-write-addition', expect_trigger: 'permission-scope-expansion', expect_severity: 'high' },
  { name: 'test-deletion-medium', files: ['tests/unit.spec.js'], diff_pattern: 'lines-removed-no-equivalent-added', expect_trigger: 'test-deletion', expect_severity: 'medium' },
  { name: 'whitelist-lockfile-checksum-only', files: ['package-lock.json'], diff_pattern: 'integrity-only', expect_trigger: 'lockfile-checksum-only', expect_severity: null, expect_no_trigger: true },
  { name: 'whitelist-auth-rename-no-logic', files: ['src/auth.js'], diff_pattern: 'rename-only', expect_trigger: 'auth-rename-no-logic-delta', expect_severity: null, expect_no_trigger: true },
];

function listRotationFixtures() { return ROTATION_FIXTURES; }
function listPreMergeFixtures() { return PRE_MERGE_FIXTURES; }
function countByRule() {
  const counts = {};
  for (const f of ROTATION_FIXTURES) {
    const rule = f.expect_violation || 'pass';
    counts[rule] = (counts[rule] || 0) + 1;
  }
  return counts;
}

module.exports = { ROTATION_FIXTURES, PRE_MERGE_FIXTURES, listRotationFixtures, listPreMergeFixtures, countByRule };
