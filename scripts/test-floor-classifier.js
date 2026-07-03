#!/usr/bin/env node
// test-floor-classifier (#3098, re-ship of Epic #1948 Phase-1 P1.1+P1.2; original
// children #2652-#2657 were phantom-closed — no impl ever merged). Derives the
// OBJECTIVE minimum test_strategy floor from the changed file set per the
// test-methodology matrix, then RECONCILES it against the agent-DECLARED strategy.
// This closes the #1948 gap: today test-evidence only verifies the *declared*
// strategy has an artifact; nothing derives what the floor *should* be from the diff.
// Ships ADVISORY (promotion to a blocking gate is replay-eval-gated per #1771/#1875).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isValidStrategy } = require('./test-strategy-enum');
// Reuse (do not duplicate) the content-level stress signal detector.
let classifySurface;
try { ({ classifySurface } = require('./stress-surface-audit')); }
catch { classifySurface = () => null; }

// Ordered surface→floor rules (most-specific first; first match wins). Mirrors the
// instructions/test-methodology-matrix.instructions.md surface table (the authority).
// `code` marks surfaces that impose a real test floor on the declared strategy
// (docs/research/test/config floors do not constrain a code PR's declared strategy).
const SURFACE_RULES = [
  { surface: 'ci-workflow', floor: 'golden-file', code: true, test: (p) => /^\.github\/workflows\/.+\.ya?ml$/.test(p) },
  { surface: 'worker-route', floor: 'contract-test', code: true, test: (p) => /^cloudflare\/.+\.ts$/.test(p) },
  { surface: 'dashboard-ui', floor: 'visual-regression', code: true, test: (p) => /^dashboard\/.+\.(js|html|css)$/.test(p) },
  { surface: 'python-hook', floor: 'tdd-pyramid', code: true, test: (p) => /^hooks\/scripts\/.+\.py$/.test(p) },
  { surface: 'llm-agent', floor: 'eval-harness', code: true, test: (p) => /^(agents|skills)\/.+\.(md|ya?ml|json)$/.test(p) },
  { surface: 'research-adr', floor: 'peer-review', code: false, test: (p) => /^research\/.+\.md$/.test(p) || /(^|\/)adr(\/|-)/i.test(p) },
  { surface: 'docs', floor: 'drift-lint', code: false, test: (p) => /^(instructions|wiki|docs)\/.+\.md$/.test(p) },
  { surface: 'test', floor: 'none', code: false, test: (p) => /^tests\/.+\.(spec|test)\.(js|ts)$/.test(p) || /_test\.py$/.test(p) },
  { surface: 'governance-script', floor: 'tdd-pyramid', code: true, test: (p) => /^scripts\/global\/.+\.js$/.test(p) || /^scripts\/[^/]+\.js$/.test(p) },
];

// Path-identifiable stress triggers (the subset of the matrix's stress-applicability
// criteria detectable from the filename alone — concurrency primitives, side-effect
// gates, adversarial parsers). Content signals are layered on via classifySurface.
const STRESS_PATH_TRIGGERS = [
  /worktree-/, /lease/, /(^|\/)lock/, /-gate\.js$/, /-check\.js$/,
  /classifier|detector|validator|guard|reconcil|parser|schema/,
];

// Strategies that do NOT satisfy a real code test floor (declaring one of these on a
// code surface that demands a real strategy is a floor violation).
const BELOW_CODE_FLOOR = new Set(['none', 'manual-verify', 'drift-lint', 'peer-review']);

/**
 * Resolve the surface + base floor for a single path (no content read).
 * @param {string} filePath repo-relative path.
 * @returns {{surface: string, floor: string, code: boolean}|null}
 */
function surfaceForPath(filePath) {
  const normalized = String(filePath).replace(/^\.\//, '').replace(/^\/+/, '');
  for (const rule of SURFACE_RULES) {
    if (rule.test(normalized)) return { surface: rule.surface, floor: rule.floor, code: rule.code };
  }
  return null;
}

/**
 * Does this path require stress-test? Path heuristics first, then content signals
 * (reused stress-surface-audit detector) when the file is readable.
 * @param {string} filePath repo-relative path.
 * @param {string} [root] repo root for the optional content read.
 * @returns {{stress: boolean, reasons: string[]}}
 */
function stressForPath(filePath, root) {
  const reasons = [];
  if (STRESS_PATH_TRIGGERS.some((re) => re.test(filePath))) reasons.push('path-signal');
  if (root) {
    const abs = path.join(root, filePath);
    if (fs.existsSync(abs)) {
      const contentReasons = classifySurface(abs);
      if (contentReasons) reasons.push(...contentReasons);
    }
  }
  return { stress: reasons.length > 0, reasons: [...new Set(reasons)] };
}

/**
 * Derive the objective floor for a changed-file set.
 * @param {string[]} changedPaths repo-relative paths.
 * @param {{root?: string}} [opts]
 * @returns {{perFile: object[], codeFloors: string[], stressRequired: boolean}}
 */
function deriveFloor(changedPaths, opts = {}) {
  const perFile = [];
  let stressRequired = false;
  const codeFloors = new Set();
  for (const filePath of changedPaths || []) {
    const surf = surfaceForPath(filePath);
    if (!surf) { perFile.push({ path: filePath, surface: 'unknown', floor: null, stress: false, reasons: [] }); continue; }
    // The JS `stress-test` strategy (tests/stress-*.spec.js evidence) only applies to JS
    // governance-scripts; python hooks (pytest) and other surfaces have their own story.
    const stressEligible = surf.surface === 'governance-script';
    const onlyCodeStress = stressEligible ? stressForPath(filePath, opts.root) : { stress: false, reasons: [] };
    if (surf.code) codeFloors.add(surf.floor);
    if (onlyCodeStress.stress) stressRequired = true;
    perFile.push({ path: filePath, surface: surf.surface, floor: surf.floor, code: surf.code,
      stress: onlyCodeStress.stress, reasons: onlyCodeStress.reasons });
  }
  return { perFile, codeFloors: [...codeFloors], stressRequired };
}

/**
 * Parse a declared test_strategy into its primary + stress components.
 * @param {string} declared e.g. "tdd-pyramid+stress-test".
 * @returns {{primary: string, stress: boolean, valid: boolean}}
 */
function parseDeclared(declared) {
  const value = String(declared || '').trim();
  const valid = isValidStrategy(value);
  const parts = value.split('+').map((s) => s.trim());
  return { primary: parts[0] || '', stress: parts.includes('stress-test'), valid };
}

/**
 * Reconcile the declared strategy against the derived floor.
 * @param {string} declared declared test_strategy.
 * @param {string[]} changedPaths repo-relative changed paths.
 * @param {{root?: string}} [opts]
 * @returns {{meetsFloor: boolean, gaps: string[], derived: object, declared: object}}
 */
function reconcile(declared, changedPaths, opts = {}) {
  const derived = deriveFloor(changedPaths, opts);
  const decl = parseDeclared(declared);
  const gaps = [];
  if (!decl.valid && (changedPaths || []).length) {
    gaps.push(`declared test_strategy "${declared}" is not a valid enum value`);
  }
  // (1) stress floor: any code file triggering stress requires +stress-test.
  if (derived.stressRequired && !decl.stress) {
    const triggers = derived.perFile.filter((f) => f.stress).map((f) => `${f.path} (${f.reasons.join('/')})`);
    gaps.push(`stress-test required by ${triggers.join(', ')} but not declared`);
  }
  // (2) primary floor: declaring a below-floor strategy on a real code surface.
  if (derived.codeFloors.length && BELOW_CODE_FLOOR.has(decl.primary)) {
    gaps.push(`declared "${decl.primary}" is below the code floor ${JSON.stringify(derived.codeFloors)}`);
  }
  return { meetsFloor: gaps.length === 0, gaps, derived, declared: decl };
}

// #3105 P1.6: versioned audit-record schema for a reconcile() result (deterministic —
// the caller supplies `ts` so the module stays pure). Feeds observability / replay-eval.
const AUDIT_SCHEMA = 'test-floor-audit-v1';

/**
 * Build a versioned audit record from a reconcile() result.
 * @param {object} result reconcile() output.
 * @param {{ts?: string, ticket?: number}} [meta] caller-supplied timestamp/ticket.
 * @returns {object} stable-shape audit record.
 */
function auditRecord(result, meta = {}) {
  return {
    schema: AUDIT_SCHEMA,
    ts: meta.ts || null,
    ticket: meta.ticket || null,
    declared: result.declared,
    derived_code_floors: result.derived.codeFloors,
    stress_required: result.derived.stressRequired,
    meets_floor: result.meetsFloor,
    gaps: result.gaps,
  };
}

/** Rollback (P1.6): the TEST_FLOOR_DISABLED env flag turns the advisory tool into a no-op. */
function isDisabled(env = process.env) { return env.TEST_FLOOR_DISABLED === '1'; }

function runCli(argv, env = process.env) {
  if (isDisabled(env)) { process.stdout.write('test-floor: disabled (TEST_FLOOR_DISABLED=1)\n'); return 0; }
  const declared = (argv.find((a) => a.startsWith('--declared=')) || '').split('=')[1]
    || (argv.includes('--declared') ? argv[argv.indexOf('--declared') + 1] : '');
  const filesArg = (argv.find((a) => a.startsWith('--files=')) || '').split('=')[1]
    || (argv.includes('--files') ? argv[argv.indexOf('--files') + 1] : '');
  const strict = argv.includes('--strict');
  const files = filesArg ? filesArg.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const result = reconcile(declared, files, { root: path.resolve(__dirname, '..', '..') });
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); }
  else {
    process.stdout.write(`declared: ${declared || '(none)'}\n`);
    process.stdout.write(`derived code-floors: ${JSON.stringify(result.derived.codeFloors)} | stress-required: ${result.derived.stressRequired}\n`);
    if (result.meetsFloor) process.stdout.write('✓ declared strategy meets the objective floor\n');
    else { process.stdout.write('⚠ floor gaps (advisory):\n'); for (const gap of result.gaps) process.stdout.write(`  - ${gap}\n`); }
  }
  // Advisory by default (exit 0); --strict makes a floor gap a non-zero exit.
  return strict && !result.meetsFloor ? 1 : 0;
}

if (require.main === module) { process.exit(runCli(process.argv.slice(2))); }

module.exports = {
  SURFACE_RULES, STRESS_PATH_TRIGGERS, BELOW_CODE_FLOOR, AUDIT_SCHEMA,
  surfaceForPath, stressForPath, deriveFloor, parseDeclared, reconcile, runCli,
  auditRecord, isDisabled,
};
