#!/usr/bin/env node
'use strict';
// test-floor-classifier.spec.js — unit tests for the objective test-floor classifier
// and declared-vs-derived reconciler (Epic #1948 P1.1/P1.2, audit-schema P1.6).
// Closes the #1948 gap where the test-sufficiency enforcer itself shipped untested.
// Run: node --test scripts/test-floor-classifier.spec.js

const { test } = require('node:test');
const assert = require('node:assert');

const clf = require('./test-floor-classifier');
const {
  surfaceForPath, deriveFloor, parseDeclared, reconcile, auditRecord, isDisabled, runCli,
  BELOW_CODE_FLOOR, AUDIT_SCHEMA,
} = clf;

// ---------------------------------------------------------------------------
// surfaceForPath — the surface→floor table (authority: test-methodology-matrix)
// ---------------------------------------------------------------------------
test('surfaceForPath maps each canonical surface to its floor', () => {
  const cases = [
    ['.github/workflows/ci.yml', 'ci-workflow', 'golden-file', true],
    ['cloudflare/router.ts', 'worker-route', 'contract-test', true],
    ['dashboard/app.js', 'dashboard-ui', 'visual-regression', true],
    ['hooks/scripts/guard.py', 'python-hook', 'tdd-pyramid', true],
    ['agents/planner.agent.md', 'llm-agent', 'eval-harness', true],
    ['skills/foo/skill.yaml', 'llm-agent', 'eval-harness', true],
    ['research/epic-1948.md', 'research-adr', 'peer-review', false],
    ['instructions/x.instructions.md', 'docs', 'drift-lint', false],
    ['tests/foo.spec.js', 'test', 'none', false],
    ['scripts/foo-helper.js', 'governance-script', 'tdd-pyramid', true],
    ['scripts/global/megalint/x.js', 'governance-script', 'tdd-pyramid', true],
  ];
  for (const [p, surface, floor, code] of cases) {
    const r = surfaceForPath(p);
    assert.ok(r, `expected a surface for ${p}`);
    assert.strictEqual(r.surface, surface, `surface for ${p}`);
    assert.strictEqual(r.floor, floor, `floor for ${p}`);
    assert.strictEqual(r.code, code, `code flag for ${p}`);
  }
});

test('surfaceForPath returns null for an unrecognized path', () => {
  assert.strictEqual(surfaceForPath('README-notes.txt'), null);
  assert.strictEqual(surfaceForPath('some/random/file.xyz'), null);
});

test('surfaceForPath normalizes leading ./ and /', () => {
  assert.strictEqual(surfaceForPath('./scripts/foo-helper.js').surface, 'governance-script');
  assert.strictEqual(surfaceForPath('/dashboard/app.js').surface, 'dashboard-ui');
});

test('surfaceForPath first-match-wins: a spec under tests/ is "test" not governance-script', () => {
  // ordering matters — the test rule precedes the governance-script rule.
  assert.strictEqual(surfaceForPath('tests/thing.spec.js').surface, 'test');
});

// ---------------------------------------------------------------------------
// deriveFloor — aggregate code floors + stress requirement across a file set
// ---------------------------------------------------------------------------
test('deriveFloor aggregates distinct code floors and ignores non-code floors', () => {
  const r = deriveFloor(['dashboard/app.js', 'scripts/foo-helper.js', 'instructions/x.md']);
  assert.deepStrictEqual([...r.codeFloors].sort(), ['tdd-pyramid', 'visual-regression']);
  // docs floor (drift-lint) is code:false → must NOT appear in codeFloors.
  assert.ok(!r.codeFloors.includes('drift-lint'));
});

test('deriveFloor flags stress on a governance-script whose name signals concurrency/parsing', () => {
  const r = deriveFloor(['scripts/lease-gate.js']); // -gate.js + lease both trigger
  assert.strictEqual(r.stressRequired, true);
  const entry = r.perFile.find((f) => f.path === 'scripts/lease-gate.js');
  assert.strictEqual(entry.stress, true);
  assert.ok(entry.reasons.includes('path-signal'));
});

test('deriveFloor does NOT flag stress for non-governance-script surfaces', () => {
  // a dashboard file named with "lock" must not become stress-required
  // (stress is only eligible on governance-script surfaces).
  const r = deriveFloor(['dashboard/lock-widget.js']);
  assert.strictEqual(r.stressRequired, false);
});

test('deriveFloor records unknown paths without contributing a floor', () => {
  const r = deriveFloor(['weird.bin']);
  assert.strictEqual(r.codeFloors.length, 0);
  assert.strictEqual(r.perFile[0].surface, 'unknown');
  assert.strictEqual(r.perFile[0].floor, null);
});

test('deriveFloor tolerates empty / nullish input', () => {
  assert.deepStrictEqual(deriveFloor([]).codeFloors, []);
  assert.deepStrictEqual(deriveFloor(undefined).codeFloors, []);
});

// ---------------------------------------------------------------------------
// parseDeclared
// ---------------------------------------------------------------------------
test('parseDeclared splits primary + stress and validates against the enum', () => {
  assert.deepStrictEqual(parseDeclared('tdd-pyramid+stress-test'),
    { primary: 'tdd-pyramid', stress: true, valid: true });
  assert.deepStrictEqual(parseDeclared('none'),
    { primary: 'none', stress: false, valid: true });
});

test('parseDeclared marks an unknown token invalid and empty input invalid', () => {
  assert.strictEqual(parseDeclared('made-up-strategy').valid, false);
  assert.deepStrictEqual(parseDeclared(''), { primary: '', stress: false, valid: false });
  assert.deepStrictEqual(parseDeclared(undefined), { primary: '', stress: false, valid: false });
});

// ---------------------------------------------------------------------------
// reconcile — the heart of the gate: declared vs objective floor
// ---------------------------------------------------------------------------
test('reconcile: declaring a floor-meeting strategy on a code surface passes', () => {
  const r = reconcile('tdd-pyramid', ['scripts/foo-helper.js']);
  assert.strictEqual(r.meetsFloor, true);
  assert.deepStrictEqual(r.gaps, []);
});

test('reconcile: below-floor declaration on a code surface is flagged', () => {
  const r = reconcile('none', ['dashboard/app.js']);
  assert.strictEqual(r.meetsFloor, false);
  assert.ok(r.gaps.some((g) => /below the code floor/.test(g)));
});

test('reconcile: stress-required-but-not-declared is flagged', () => {
  const r = reconcile('tdd-pyramid', ['scripts/lease-gate.js']);
  assert.strictEqual(r.meetsFloor, false);
  assert.ok(r.gaps.some((g) => /stress-test required/.test(g)));
});

test('reconcile: declaring +stress-test satisfies the stress floor', () => {
  const r = reconcile('tdd-pyramid+stress-test', ['scripts/lease-gate.js']);
  assert.strictEqual(r.meetsFloor, true);
});

test('reconcile: invalid declared strategy with a changed file is flagged', () => {
  const r = reconcile('bogus', ['scripts/foo-helper.js']);
  assert.ok(r.gaps.some((g) => /not a valid enum value/.test(g)));
});

test('reconcile: empty change set never fails (nothing to gate)', () => {
  const r = reconcile('anything-goes', []);
  assert.strictEqual(r.meetsFloor, true);
  assert.deepStrictEqual(r.gaps, []);
});

test('reconcile: docs-only change imposes no code floor', () => {
  const r = reconcile('drift-lint', ['instructions/x.md', 'wiki/y.md']);
  assert.strictEqual(r.meetsFloor, true);
});

test('BELOW_CODE_FLOOR contains the non-sufficient strategies', () => {
  for (const s of ['none', 'manual-verify', 'drift-lint', 'peer-review']) {
    assert.ok(BELOW_CODE_FLOOR.has(s), `${s} should be below code floor`);
  }
  assert.ok(!BELOW_CODE_FLOOR.has('tdd-pyramid'));
});

// ---------------------------------------------------------------------------
// auditRecord — versioned, deterministic (caller supplies ts)
// ---------------------------------------------------------------------------
test('auditRecord emits the versioned schema with caller-supplied metadata', () => {
  const result = reconcile('none', ['dashboard/app.js']);
  const rec = auditRecord(result, { ts: '2026-07-13T00:00:00Z', ticket: 1948 });
  assert.strictEqual(rec.schema, AUDIT_SCHEMA);
  assert.strictEqual(rec.schema, 'test-floor-audit-v1');
  assert.strictEqual(rec.ts, '2026-07-13T00:00:00Z');
  assert.strictEqual(rec.ticket, 1948);
  assert.strictEqual(rec.meets_floor, false);
  assert.ok(Array.isArray(rec.gaps) && rec.gaps.length > 0);
  assert.ok(rec.derived_code_floors.includes('visual-regression'));
});

test('auditRecord defaults ts/ticket to null when unspecified (stays pure/deterministic)', () => {
  const rec = auditRecord(reconcile('tdd-pyramid', ['scripts/foo-helper.js']));
  assert.strictEqual(rec.ts, null);
  assert.strictEqual(rec.ticket, null);
  assert.strictEqual(rec.meets_floor, true);
});

// ---------------------------------------------------------------------------
// isDisabled + runCli — rollback flag and advisory-vs-strict exit semantics
// ---------------------------------------------------------------------------
test('isDisabled honors the TEST_FLOOR_DISABLED rollback flag', () => {
  assert.strictEqual(isDisabled({ TEST_FLOOR_DISABLED: '1' }), true);
  assert.strictEqual(isDisabled({ TEST_FLOOR_DISABLED: '0' }), false);
  assert.strictEqual(isDisabled({}), false);
});

// Capture stdout so CLI tests stay quiet and assertable.
function captureCli(argv, env) {
  const orig = process.stdout.write;
  let out = '';
  process.stdout.write = (chunk) => { out += chunk; return true; };
  let code;
  try { code = runCli(argv, env); } finally { process.stdout.write = orig; }
  return { code, out };
}

test('runCli is a no-op returning 0 when disabled', () => {
  const { code, out } = captureCli(['--declared=none', '--files=dashboard/app.js'],
    { TEST_FLOOR_DISABLED: '1' });
  assert.strictEqual(code, 0);
  assert.match(out, /disabled/);
});

test('runCli is advisory by default: floor gaps still exit 0', () => {
  const { code, out } = captureCli(['--declared=none', '--files=dashboard/app.js'], {});
  assert.strictEqual(code, 0);
  assert.match(out, /advisory/);
});

test('runCli --strict turns a floor gap into a non-zero exit', () => {
  const { code } = captureCli(['--declared=none', '--files=dashboard/app.js', '--strict'], {});
  assert.strictEqual(code, 1);
});

test('runCli --strict with a floor-meeting declaration exits 0', () => {
  const { code } = captureCli(
    ['--declared=tdd-pyramid', '--files=scripts/foo-helper.js', '--strict'], {});
  assert.strictEqual(code, 0);
});

test('runCli --json emits a parseable reconcile result', () => {
  const { code, out } = captureCli(
    ['--declared=none', '--files=dashboard/app.js', '--json'], {});
  assert.strictEqual(code, 0);
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.meetsFloor, false);
  assert.ok(Array.isArray(parsed.gaps));
});

// ---------------------------------------------------------------------------
// advisoryLines — the non-blocking gate-wiring surface (P1.2)
// ---------------------------------------------------------------------------
test('advisoryLines renders declared/derived/meets + per-gap advisory lines', () => {
  const r = clf.advisoryLines('none', ['dashboard/app.js'], { ticket: 1948 });
  assert.strictEqual(r.disabled, false);
  assert.strictEqual(r.meetsFloor, false);
  assert.ok(r.lines.some((l) => /^test_floor_declared: none/.test(l)));
  assert.ok(r.lines.some((l) => /test_floor_meets: no \(advisory\)/.test(l)));
  assert.ok(r.lines.some((l) => /^test_floor_gap: /.test(l)));
  // it carries a versioned, attributable audit record for observability
  assert.strictEqual(r.record.schema, 'test-floor-audit-v1');
  assert.strictEqual(r.record.ticket, 1948);
});

test('advisoryLines reports a clean pass with no gap lines', () => {
  const r = clf.advisoryLines('tdd-pyramid', ['scripts/foo-helper.js']);
  assert.strictEqual(r.meetsFloor, true);
  assert.ok(r.lines.some((l) => /test_floor_meets: yes/.test(l)));
  assert.ok(!r.lines.some((l) => /^test_floor_gap: /.test(l)));
});

test('advisoryLines honors the TEST_FLOOR_DISABLED rollback flag (no-op)', () => {
  const r = clf.advisoryLines('none', ['dashboard/app.js'], { env: { TEST_FLOOR_DISABLED: '1' } });
  assert.strictEqual(r.disabled, true);
  assert.strictEqual(r.record, null);
  assert.ok(r.lines.some((l) => /disabled/.test(l)));
});
