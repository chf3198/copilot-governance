function normalizeHook(current, governanceCall) {
  const lines = current.split('\n').filter((line) => line.trim() !== governanceCall);
  let insertAt = 0;
  if (lines[0] && lines[0].startsWith('#!')) insertAt = 1;
  if (lines[insertAt] && lines[insertAt].trim() === 'set -euo pipefail') insertAt += 1;
  if (lines[insertAt] !== '') {
    lines.splice(insertAt, 0, '');
    insertAt += 1;
  }
  lines.splice(insertAt, 0, governanceCall);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function ordered(content, tokens) {
  let cursor = -1;
  for (const token of tokens) {
    const index = content.indexOf(token);
    if (index === -1 || index <= cursor) return false;
    cursor = index;
  }
  return true;
}

function hasManagedBlock(content, blockStart, blockEnd) {
  return content.includes(blockStart) && content.includes(blockEnd) && content.indexOf(blockStart) < content.indexOf(blockEnd);
}

function includesAll(content, tokens) {
  return tokens.every((token) => content.includes(token));
}

function hookSemantics(content, governanceCall, trailingTokens) {
  const hasShebang = content.startsWith('#!/usr/bin/env bash');
  const hasSafety = content.includes('set -euo pipefail');
  const callIndex = content.indexOf(governanceCall);
  const trailingIndexes = trailingTokens.map((token) => content.indexOf(token)).filter((index) => index !== -1);
  const governanceBeforeTrailing = trailingIndexes.every((index) => callIndex !== -1 && callIndex < index);
  return hasShebang && hasSafety && callIndex !== -1 && governanceBeforeTrailing;
}

function strictAudit({ exists, read, paths, hooksPath, governanceCall, blockStart, blockEnd }) {
  const checks = {
    global_skills_file: exists(paths.globalSkillsPath),
    skill_routing_file: exists(paths.skillRoutingPath),
    openclaw_overlay_file: exists(paths.openclawPath),
    governance_script_file: exists(paths.governanceScriptPath),
    governance_workflow_file: exists(paths.workflowPath),
    pre_commit_hook: exists(paths.preCommitPath),
    pre_push_hook: exists(paths.prePushPath),
    hooks_path_expected: hooksPath === '.githooks' || hooksPath === 'skipped'
  };
  const globalContent = checks.global_skills_file ? read(paths.globalSkillsPath) : '';
  const routingContent = checks.skill_routing_file ? read(paths.skillRoutingPath) : '';
  const openclawContent = checks.openclaw_overlay_file ? read(paths.openclawPath) : '';
  const governanceContent = checks.governance_script_file ? read(paths.governanceScriptPath) : '';
  const workflowText = checks.governance_workflow_file ? read(paths.workflowPath) : '';
  const preCommitContent = checks.pre_commit_hook ? read(paths.preCommitPath) : '';
  const prePushContent = checks.pre_push_hook ? read(paths.prePushPath) : '';

  checks.global_skills_managed = hasManagedBlock(globalContent, blockStart, blockEnd);
  checks.skill_routing_managed = hasManagedBlock(routingContent, blockStart, blockEnd);
  checks.openclaw_overlay_managed = hasManagedBlock(openclawContent, blockStart, blockEnd);
  checks.global_contract_order = ordered(globalContent, [
    'repo-standards-router',
    'openclaw-universal-system',
    'network-platform-resources',
    'openclaw-availability-utilization',
    'web-regression-governance',
    'github-ops-tree-router',
    'workflow-self-anneal'
  ]);
  checks.skill_routing_order = ordered(routingContent, [
    'repo-standards-router',
    'openclaw-universal-system',
    'network-platform-resources',
    'openclaw-availability-utilization',
    'workflow-self-anneal'
  ]);
  checks.governance_script_semantics = includesAll(governanceContent, [
    '.github/instructions/global-skills.instructions.md',
    '.github/instructions/skill-routing.instructions.md',
    '.github/instructions/openclaw-universal.instructions.md',
    '.github/workflows/global-governance-presence.yml',
    '.githooks/pre-commit',
    '.githooks/pre-push',
    'Global governance presence check FAILED',
    'exit 1',
    'Global governance presence check PASSED'
  ]);
  checks.workflow_semantics = includesAll(workflowText, [
    'name: global-governance-presence',
    'pull_request:',
    'branches: [master]',
    'actions/checkout@v4',
    governanceCall
  ]);
  checks.pre_commit_semantics = hookSemantics(preCommitContent, governanceCall, ['npm run lint']);
  checks.pre_push_semantics = hookSemantics(prePushContent, governanceCall, ['npm run lint', 'npm test']);

  const failed = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  return { checks, failed };
}

module.exports = {
  normalizeHook,
  strictAudit
};
