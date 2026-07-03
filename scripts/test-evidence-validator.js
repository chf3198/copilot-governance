#!/usr/bin/env node
'use strict';
// tier: 2
// test-evidence-validator (#1214) — pure function consumed by .github/workflows/test-evidence.yml.
// Per instructions/test-methodology-matrix.instructions.md.
// Enum constants sourced from test-strategy-enum.js (#1236).

const { ALLOWED_STRATEGIES, NONE_PERMITTED_LANES, PEER_REVIEW_RUBRIC_THRESHOLD } = require('./test-strategy-enum');

function fail(rule, detail) { return { ok: false, reason: rule, violations: [{ rule, detail }] }; }
function ok(reason = 'evidence-present') { return { ok: true, reason, violations: [] }; }

function trail(comments) { return (comments || []).map(c => c.body || '').join('\n'); }
function anyFile(prFiles, patterns) {
  return (prFiles || []).some(f => patterns.some(p => p.test(f)));
}

// JS/TS spec (original, unchanged) and Python pytest spec (#3276): tests/**/test_*.py or *_test.py.
const JS_SPEC_RE = /^tests\/.+\.(spec|test)\.(js|ts)$/;
const PY_SPEC_RE = /^tests\/(?:.+\/)?(?:test_[^/]+|[^/]+_test)\.py$/;

// "Python surface present" predicate (#3276): a *.py path in the diff that is NOT itself a
// pytest spec. Gates Python evidence on real Python source change so a stray test file in a
// pure-JS diff cannot satisfy the gate (no false positive). Path-pattern only — intentionally
// not git-status-aware and POSIX forward-slash (matches `gh pr view --json files`).
function hasPythonSource(prFiles) {
  return (prFiles || []).some(f => /\.py$/.test(f) && !PY_SPEC_RE.test(f));
}

// tdd-pyramid / tdd-trophy: accept a JS/TS spec (unchanged), OR a Python pytest spec when the
// diff also changes Python source. Distinct `python-pytest-evidence` reason for G8 attributability.
function pyramidCheck(ctx) {
  if (anyFile(ctx.pr_files, [JS_SPEC_RE])) return ok();
  if ((ctx.pr_files || []).some(f => PY_SPEC_RE.test(f)) && hasPythonSource(ctx.pr_files)) {
    return ok('python-pytest-evidence');
  }
  return fail('missing-spec-file',
    'tdd-pyramid requires tests/**/*.spec.{js,ts}, or tests/**/test_*.py|*_test.py with a Python source file in the diff');
}

const CHECKERS = {
  'tdd-pyramid': (ctx) => pyramidCheck(ctx),
  'tdd-trophy': (ctx) => pyramidCheck(ctx),
  'contract-test': (ctx) => anyFile(ctx.pr_files,
    [/^cloudflare\/.*(test|spec)\.(ts|js)$/, /^tests\/.*contract.*\.(spec|test)\.(js|ts)$/])
    ? ok() : fail('missing-contract-test', 'contract-test requires cloudflare/**/test.ts or tests/**contract*.spec.*'),
  'golden-file': (ctx) => anyFile(ctx.pr_files, [/^tests\/fixtures\//])
    ? ok() : fail('missing-fixture', 'golden-file requires tests/fixtures/** artifact'),
  'eval-harness': (ctx) => anyFile(ctx.pr_files, [/^tests\/eval\//])
    ? ok() : fail('missing-eval-fixture', 'eval-harness requires tests/eval/** fixture'),
  'visual-regression': (ctx) => /VISUAL_QA_EVIDENCE/.test(trail(ctx.comments))
    ? ok() : fail('missing-visual-qa', 'visual-regression requires VISUAL_QA_EVIDENCE block in trail'),
  'drift-lint': (ctx) => /docs-drift-maintenance/.test(trail(ctx.comments))
    ? ok() : fail('missing-drift-lint', 'drift-lint requires docs-drift-maintenance citation in trail'),
  'peer-review': (ctx) => {
    const trailText = trail(ctx.comments);
    if (!/CONSULTANT_CLOSEOUT/.test(trailText)) return fail('missing-closeout', 'peer-review requires CONSULTANT_CLOSEOUT');
    const match = trailText.match(/rubric_rating:\s*(\d+)\s*\/\s*10/);
    const rating = match ? parseInt(match[1], 10) : 0;
    return rating >= PEER_REVIEW_RUBRIC_THRESHOLD
      ? ok() : fail('rubric-below-threshold', `peer-review rating ${rating} < ${PEER_REVIEW_RUBRIC_THRESHOLD}`);
  },
  'manual-verify': (ctx) => /before(\s*\/\s*|\s*and\s*)?after|before:.+after:/i.test(trail(ctx.comments))
    ? ok() : fail('missing-manual-verify', 'manual-verify requires before/after value citation'),
  'none': (ctx) => NONE_PERMITTED_LANES.includes(ctx.lane)
    ? ok('none-permitted-lane')
    : fail('none-disallowed', `test_strategy=none disallowed for ${ctx.lane}; declare a strategy from matrix`),
};

function validate(ctx = {}) {
  const raw = ctx.test_strategy || 'none';
  // Composed strategy (#3278): '<primary>+stress-test' per the matrix (Epic #1875). The primary
  // checker runs here; the stress half is enforced by the separate stress-evidence gate. Honor the
  // matrix contract rather than rejecting the composed form or relying on the workflow truncating it.
  const parts = raw.split('+').map((s) => s.trim());
  const primary = parts[0];
  const composedValid = parts.length === 1 || (parts.length === 2 && parts[1] === 'stress-test');
  // CHECKERS lacks a bare 'stress-test' key (it is only ever a SECOND strategy), so gating on the
  // checker's existence both rejects unknown strategies and avoids a crash on a standalone stress-test.
  if (!composedValid || !CHECKERS[primary]) {
    return fail('unknown-strategy', `'${raw}' not in matrix enum; see instructions/test-methodology-matrix.instructions.md`);
  }
  return CHECKERS[primary](ctx);
}

if (require.main === module) {
  const fs = require('node:fs');
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : null; };
  const ctx = {
    test_strategy: arg('strategy') || 'none',
    lane: arg('lane') || 'lane:code-change',
    comments: arg('comments') ? JSON.parse(fs.readFileSync(arg('comments'), 'utf8')) : [],
    pr_files: arg('pr-files') ? JSON.parse(fs.readFileSync(arg('pr-files'), 'utf8')) : [],
  };
  const result = validate(ctx);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

module.exports = { validate, ALLOWED_STRATEGIES, NONE_PERMITTED_LANES };
