#!/usr/bin/env node
'use strict';
// Single source of truth for the set of sandbox launcher targets (#3734).
//
// Both the post-merge sync workflow (.github/workflows/post-merge-sandbox-sync.yml)
// and the audit (scripts/global/worktree-governance-audit.js) MUST derive their
// launcher list from THIS helper so the two can never drift again. Previously the
// sync workflow carried a hardcoded 3-name subset while the audit validated all
// five catalog runtimes, so sandbox/antigravity + sandbox/cursor silently fell
// behind main and bricked every merge via worktree-governance-required (#3734).
//
// Targets are the Epic #3411 runtime-catalog SSoT (inventory/runtimes/*.json via
// listRuntimes()). The fallback keeps both consumers sane if the catalog is
// unreadable (G6) instead of syncing/validating nothing.
const { listRuntimes } = require('./runtime-descriptor');

const FALLBACK = ['antigravity', 'claude-code', 'codex', 'copilot', 'cursor'];

function sandboxLauncherTargets() {
  const catalog = listRuntimes();
  return catalog.length ? catalog : FALLBACK.slice();
}

function sandboxLauncherBranches() {
  return sandboxLauncherTargets().map((target) => `sandbox/${target}`);
}

module.exports = { sandboxLauncherTargets, sandboxLauncherBranches, FALLBACK };

if (require.main === module) {
  const asJson = process.argv.includes('--json');
  const targets = sandboxLauncherTargets();
  if (asJson) {
    process.stdout.write(JSON.stringify({ targets, branches: sandboxLauncherBranches() }) + '\n');
  } else {
    process.stdout.write(sandboxLauncherBranches().join('\n') + '\n');
  }
}
