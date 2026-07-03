'use strict';
// tier: 3
// Runtime-neutral review CLI parity (#2935 / Epic #2926 C9, design D9/G9). The entire review pipeline
// lives in the SINGLE scripts/global/ source — no per-runtime fork — so every runtime's review skill
// invokes the same CLI and gets identical cost-ascending behaviour. This verifier locks that
// invariant (one shared CLI) and MEASURES per-runtime deployment coverage honestly (gaps are reported,
// not hidden behind a fake pass). Deployment itself stays deploy.sh's job.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// The canonical review pipeline (C1 + C3-C6 + C8). One shared CLI surface, all runtimes.
const REVIEW_CLI_MODULES = Object.freeze([
  'cascade-dispatch.js',        // C1 canonical review CLI
  'fleet-backend-select.js',    // C3 probe-first routing
  'fleet-escalation-policy.js', // C4 escalation + breaker
  'review-stakes-router.js',    // C5 stakes-tier selector
  'review-cost-telemetry.js',   // C6 cost telemetry
  'review-privacy-gate.js',     // C8 privacy gate
]);

function reviewCliManifest() {
  return { modules: [...REVIEW_CLI_MODULES], count: REVIEW_CLI_MODULES.length };
}

function hashFile(p, readFile) {
  const read = readFile || ((fp) => fs.readFileSync(fp));
  return crypto.createHash('sha256').update(read(p)).digest('hex');
}

/** AC2: every review module exists in the single canonical source dir. */
function verifyCanonicalSource(sourceDir, deps = {}) {
  const exists = deps.exists || fs.existsSync;
  const missing = REVIEW_CLI_MODULES.filter((m) => !exists(path.join(sourceDir, m)));
  return { ok: missing.length === 0, missing, total: REVIEW_CLI_MODULES.length };
}

/**
 * AC3: content-hash each module against each runtime target that exists. Tolerant of absent targets
 * (reported under absentTargets, not a hard failure — deployment lag is deploy.sh's concern).
 * @returns {{parity, coverage, mismatches, absentTargets, checked}}
 */
function verifyRuntimeParity({ sourceDir, targets = [] } = {}, deps = {}) {
  const exists = deps.exists || fs.existsSync;
  const readFile = deps.readFile;
  const mismatches = [];
  const absentTargets = [];
  let checked = 0;
  let matched = 0;
  for (const target of targets) {
    if (!exists(target.scriptsDir)) { absentTargets.push(target.runtime); continue; }
    for (const mod of REVIEW_CLI_MODULES) {
      const src = path.join(sourceDir, mod);
      const dst = path.join(target.scriptsDir, mod);
      checked += 1;
      if (!exists(dst)) { mismatches.push({ runtime: target.runtime, module: mod, reason: 'absent' }); continue; }
      if (hashFile(src, readFile) !== hashFile(dst, readFile)) {
        mismatches.push({ runtime: target.runtime, module: mod, reason: 'hash-mismatch' });
      } else { matched += 1; }
    }
  }
  return {
    parity: mismatches.length === 0 && checked > 0,
    coverage: checked ? matched / checked : 0,
    mismatches, absentTargets, checked,
  };
}

module.exports = {
  REVIEW_CLI_MODULES, reviewCliManifest, verifyCanonicalSource, verifyRuntimeParity, hashFile,
};
