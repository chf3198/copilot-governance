#!/usr/bin/env node
'use strict';
// gate-corpus-deploy-plan.js — Refs #3446 (Epic #3411 T2.3)
//
// Design decision: ship-corpus path chosen over MCP-delivery as the primary deterministic
// deploy strategy. Rationale: ship-corpus is a simple rsync of scripts/global/ → gateCorpusHome
// with no live MCP dependency, satisfying G5 portability and G6 resilience. MCP-delivery
// remains a future optional accelerator (Tier-2, HAMR-layer). The fork adjudication was
// recorded autonomously per operator-autonomy contract (Epic #3391) and noted on ticket #3446.
//
// This module exposes pure-function plan/verify logic so deploy.sh behaviour is
// unit-testable without touching the real ~/.cursor or ~/.antigravity directories.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// GATE_CORPUS_RUNTIMES is the single source of truth for which runtimes receive the
// scripts/global plane.  Paths match deploy.gateCorpusHome in the descriptor files:
//   inventory/runtimes/cursor.json      → ~/.cursor/scripts/global
//   inventory/runtimes/antigravity.json → ~/.antigravity/scripts/global
const GATE_CORPUS_RUNTIMES = [
  { name: 'cursor', gateCorpusHome: path.join(os.homedir(), '.cursor', 'scripts', 'global') },
  { name: 'antigravity', gateCorpusHome: path.join(os.homedir(), '.antigravity', 'scripts', 'global') },
];

/**
 * Build the deploy plan for a single runtime descriptor.
 * @param {object} descriptor - { name: string, gateCorpusHome: string }
 * @param {string} sourceDir  - absolute path to scripts/global/ source
 * @returns {{ runtime: string, sourceDir: string, destDir: string }}
 */
function buildRuntimePlan(descriptor, sourceDir) {
  return {
    runtime: descriptor.name,
    sourceDir,
    destDir: descriptor.gateCorpusHome,
  };
}

/**
 * Build the full gate-corpus deploy plan for all runtimes.
 * @param {string} repoRoot - absolute path to the repository root
 * @param {Array} runtimes  - runtime descriptor list (defaults to GATE_CORPUS_RUNTIMES)
 * @returns {Array<{ runtime: string, sourceDir: string, destDir: string }>}
 */
function gateCorpusDeployPlan(repoRoot, runtimes) {
  const descriptors = runtimes || GATE_CORPUS_RUNTIMES;
  const sourceDir = path.join(repoRoot, 'scripts', 'global');
  return descriptors.map((descriptor) => buildRuntimePlan(descriptor, sourceDir));
}

/**
 * Verify the gate corpus was deployed for one runtime entry.
 * Checks that destDir exists and contains at least one .js file.
 * @param {object} entry - plan entry with { runtime, sourceDir, destDir }
 * @returns {{ runtime: string, ok: boolean, destDir: string, jsFileCount: number, error?: string }}
 */
function verifyCorpusEntry(entry) {
  if (!fs.existsSync(entry.destDir)) {
    return { runtime: entry.runtime, ok: false, destDir: entry.destDir, jsFileCount: 0,
      error: `gate corpus missing: ${entry.destDir} does not exist` };
  }

  let files;
  try {
    files = fs.readdirSync(entry.destDir);
  } catch (readErr) {
    return { runtime: entry.runtime, ok: false, destDir: entry.destDir, jsFileCount: 0,
      error: `gate corpus unreadable: ${readErr.message}` };
  }

  const jsFileCount = files.filter((fileName) => fileName.endsWith('.js')).length;
  if (jsFileCount === 0) {
    return { runtime: entry.runtime, ok: false, destDir: entry.destDir, jsFileCount: 0,
      error: `gate corpus empty: no .js files found in ${entry.destDir}` };
  }

  return { runtime: entry.runtime, ok: true, destDir: entry.destDir, jsFileCount };
}

/**
 * Verify the full gate-corpus deployment across all plan entries.
 * @param {Array} planEntries - output of gateCorpusDeployPlan()
 * @returns {{ ok: boolean, results: Array, totalMissing: number }}
 */
function verifyGateCorpus(planEntries) {
  const results = planEntries.map(verifyCorpusEntry);
  const totalMissing = results.filter((result) => !result.ok).length;
  return { ok: totalMissing === 0, results, totalMissing };
}

if (require.main === module) {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const plan = gateCorpusDeployPlan(repoRoot);
  const verification = verifyGateCorpus(plan);
  console.log(JSON.stringify({ plan, verification }, null, 2));
  process.exit(verification.ok ? 0 : 1);
}

module.exports = { gateCorpusDeployPlan, verifyGateCorpus, verifyCorpusEntry,
  buildRuntimePlan, GATE_CORPUS_RUNTIMES };
