#!/usr/bin/env node
'use strict';
// state-store-parity-check (#1934) — verifies the inventory state_store map covers every runtime.
//
// The lease / lock / audit-log / per-session-state PRIMITIVES already exist on main
// (cross-team-lease-registry.js, worktree-active-session-lock.js, state_store.py + runtime_paths.py).
// What was missing is the parity SURFACE: the orchestrator manifest listed `state_store` as a canonical
// surface but never mapped or verified per-runtime semantics. This module closes that gap.
//
// Advisory by design: it flags only an UNMAPPED runtime (a new runtime added to the manifest's top-level
// `runtimes` list without a state_store entry) or a "full" runtime with no declared path. A runtime that is
// intentionally not deployed (claude-code, cursor) is RECORDED with status:not-deployed and is NOT a finding,
// so a complete manifest keeps the parity audit strict-clean.

// Canonical per-runtime state roots (mirrors hooks/scripts/runtime_paths.py#state_root). null = not-deployed.
const KNOWN_STATE_ROOTS = {
  copilot: '~/.copilot/hooks/state/',
  codex: '~/.codex/devenv-ops/state/',
  antigravity: '~/.gemini/antigravity/state/',
  'claude-code': null,
  cursor: null,
};

function run({ stateStore, runtimes } = {}) {
  const ss = stateStore || {};
  const declared = ss.runtimes || {};
  const allRuntimes = runtimes && runtimes.length ? runtimes : Object.keys(KNOWN_STATE_ROOTS);
  const findings = [];
  for (const rt of allRuntimes) {
    const entry = declared[rt];
    if (!entry) {
      findings.push({ id: `state-store-unmapped-${rt}`, severity: 'medium',
        summary: `Runtime ${rt} has no state_store parity entry.`,
        evidence: `inventory stateStoreParity.runtimes is missing ${rt}`,
        recommendation: `Add a state_store entry for ${rt} (statePath, or status:not-deployed if intentional).` });
      continue;
    }
    if (entry.status === 'full' && !entry.statePath) {
      findings.push({ id: `state-store-path-missing-${rt}`, severity: 'medium',
        summary: `Runtime ${rt} is marked full but declares no statePath.`,
        evidence: `stateStoreParity.runtimes.${rt}.statePath is empty`,
        recommendation: `Record the deployed state_store path for ${rt}.` });
    }
  }
  return { surface: 'state_store', runtimes: declared,
    sharedCrossCuttingPaths: ss.sharedCrossCuttingPaths || [], findings };
}

module.exports = { run, KNOWN_STATE_ROOTS };

if (require.main === module) {
  const path = require('node:path');
  const fs = require('node:fs');
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'inventory',
    'orchestrator-governance-parity.json'), 'utf8'));
  const out = run({ stateStore: m.stateStoreParity, runtimes: m.runtimes });
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(process.argv.includes('--strict') && out.findings.length ? 1 : 0);
}
