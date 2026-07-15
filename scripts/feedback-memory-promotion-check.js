#!/usr/bin/env node
'use strict';
// feedback-memory-promotion-check (#2686, Epic #2399 AC5) — advisory pre-commit
// check. Flags newly-ADDED operator-memory `feedback_*.md` files so the operator
// is prompted to consider promotion to canonical instructions/ per Epic #2399.
//
// Contract:
//   AC1 wired into lefthook.yml pre-commit.
//   AC2 advisory only — always exits 0; never blocks a commit.
//   AC3 idempotent — fires ONLY on git `A` (added) status, never on modified or
//       pre-existing files.
// Runtime-agnostic (scripts/global/, cross-team mirrored) so one check protects
// all four teams. Bypass: FEEDBACK_MEMORY_CHECK_BYPASS=1.

const { execFileSync } = require('node:child_process');

const PROMOTION_HINT =
  'Consider promoting this rule-of-thumb to canonical instructions/ (or ' +
  'wiki/wisdom/global/concepts/) per Epic #2399 when it applies to all teams and ' +
  'reflects a canonical-true harness fact. Advisory only — the commit proceeds.';

// Operator-memory scoping: a `feedback_*.md` basename under a `memory` directory
// segment (incl. `.claude/**/memory`). This precision avoids false positives on
// unrelated `feedback` docs elsewhere while still catching the target class if a
// memory file is ever staged. Mirrors the runtime-side memory_write_guard path.
function isFeedbackMemoryPath(filePath) {
  const base = (filePath.split('/').pop() || '').trim();
  if (!/^feedback_.*\.md$/.test(base)) return false;
  return /(^|\/)memory(\/|$)/.test(filePath) || /\.claude\/.*memory/.test(filePath);
}

function gitStagedNameStatus() {
  try {
    return execFileSync('git', ['diff', '--cached', '--name-status'], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

// findNewFeedbackMemory(nameStatus) -> [path,...] for `A`-status feedback-memory adds.
function findNewFeedbackMemory(nameStatus) {
  return String(nameStatus || '')
    .split('\n')
    .map((line) => line.match(/^A\t(.+)$/))
    .filter(Boolean)
    .map((match) => match[1].trim())
    .filter(isFeedbackMemoryPath);
}

function check(opts = {}) {
  if (process.env.FEEDBACK_MEMORY_CHECK_BYPASS === '1') {
    return { ok: true, skipped: 'env-bypass', advisory: false, files: [] };
  }
  const nameStatus = opts.nameStatus !== undefined ? opts.nameStatus : gitStagedNameStatus();
  const files = findNewFeedbackMemory(nameStatus);
  return { ok: true, advisory: files.length > 0, files, hint: PROMOTION_HINT };
}

if (require.main === module) {
  const result = check();
  if (result.advisory) {
    process.stderr.write('[feedback-memory-promotion] advisory — new operator-memory file(s):\n');
    for (const file of result.files) process.stderr.write(`  - ${file}\n`);
    process.stderr.write(`  ${PROMOTION_HINT}\n`);
  }
  process.exit(0); // advisory only — never blocks (AC2)
}

module.exports = { check, findNewFeedbackMemory, isFeedbackMemoryPath, PROMOTION_HINT };
