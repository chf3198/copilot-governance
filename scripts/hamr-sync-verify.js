#!/usr/bin/env node
// hamr-sync-verify.js — HAMR Wave 7 child E (#955). Refs #2950.
// Read-only: confirms HAMR scripts and the C9 review pipeline modules are
// present in ~/.copilot/scripts/ and ~/.codex/devenv-ops/scripts/.
// Extended by #3446 (Epic #3411 T2.3): also verifies gate corpus deployed
// to ~/.cursor/scripts/global and ~/.antigravity/scripts/global.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { verifyRuntimeParity, REVIEW_CLI_MODULES } = require('./review-cli-parity');
const { gateCorpusDeployPlan, verifyGateCorpus } = require('./gate-corpus-deploy-plan');

const HAMR_SCRIPTS = [
  'cache-hit-gate.js', 'cache-stats-emit.js', 'cache-stats-push.js',
  'header-spillover.js', 'sticky-route.js', 'litellm-client.js',
  'token-provider-adapters.js', 'hamr-provider-wrapper.js',
  'substrate-health-push.js', 'log-rotate.js',
  'anthropic-batch-router.js', 'batch-validator.js',
  'rule-coverage-gate.js', 'constitution-compressor.js',
];

const TARGETS = [
  { team: 'copilot', dir: path.join(os.homedir(), '.copilot', 'scripts') },
  { team: 'codex', dir: path.join(os.homedir(), '.codex', 'devenv-ops', 'scripts') },
];

const REVIEW_TARGETS = [
  { runtime: 'copilot', scriptsDir: path.join(os.homedir(), '.copilot', 'scripts') },
  { runtime: 'codex', scriptsDir: path.join(os.homedir(), '.codex', 'devenv-ops', 'scripts') },
];

function checkTarget(target) {
  if (!fs.existsSync(target.dir)) {
    return { team: target.team, dir: target.dir, exists: false, missing: HAMR_SCRIPTS, present: [] };
  }
  const present = [];
  const missing = [];
  for (const script of HAMR_SCRIPTS) {
    if (fs.existsSync(path.join(target.dir, script))) present.push(script);
    else missing.push(script);
  }
  return { team: target.team, dir: target.dir, exists: true, missing, present };
}

function run() {
  const results = TARGETS.map(checkTarget);
  const totalMissing = results.reduce((sum, r) => sum + r.missing.length, 0);
  const reviewParity = verifyRuntimeParity({ sourceDir: __dirname, targets: REVIEW_TARGETS });
  const repoRoot = path.resolve(__dirname, '..', '..');
  const corpusPlan = gateCorpusDeployPlan(repoRoot);
  const corpusVerify = verifyGateCorpus(corpusPlan);
  const ok = totalMissing === 0 && reviewParity.parity && corpusVerify.ok;
  const corpusHint = !corpusVerify.ok
    ? 'gate corpus missing: run `npm run deploy:cursor:apply` and `npm run deploy:antigravity:apply`'
    : null;
  const hint = totalMissing > 0 ? 'run `npm run sync:both:apply` to deploy HAMR scripts' :
    !reviewParity.parity ? 'review pipeline gap: run `npm run deploy:both:apply`' :
    corpusHint;
  return { ok, targets: results, total_missing: totalMissing, review_parity: reviewParity,
    gate_corpus: corpusVerify, hint };
}

if (require.main === module) {
  const result = run();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

module.exports = { run, HAMR_SCRIPTS, TARGETS, REVIEW_CLI_MODULES, REVIEW_TARGETS };
