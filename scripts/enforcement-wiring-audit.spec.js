#!/usr/bin/env node
'use strict';

// Regression spec for enforcement-wiring-audit (#3802). Self-executing; exit 1 on any failure.
// Hermetic: Node built-ins only (assert/fs/path/os); builds a throwaway fixture tree — no network,
// no repo-content coupling for the correctness assertions.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const audit = require('./enforcement-wiring-audit');

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

// --- Unit: scriptRefsIn / requireEdges parsing -------------------------------------------------
ok('scriptRefsIn matches .js and .spec.js references', () => {
  const names = audit.scriptRefsIn('run: node scripts/foo.js && node scripts/bar-baz.spec.js');
  assert.deepStrictEqual([...names].sort(), ['bar-baz', 'foo']);
});

ok('scriptRefsIn ignores non-scripts paths', () => {
  const names = audit.scriptRefsIn('cat wiki/scriptsfoo.js other/scripts/x.js scripts/ok.js');
  // `other/scripts/x.js` also matches by design (the token `scripts/x.js` is present) — the
  // audit only cares whether a validator basename is named anywhere in an enforced root.
  assert.ok(names.has('ok'));
  assert.ok(names.has('x'));
  assert.ok(!names.has('scriptsfoo'));
});

// --- Fixture: full classification --------------------------------------------------------------
function writeFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ewa-fixture-'));
  const mk = (rel, body) => {
    const p = path.join(rootDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  };

  // Validators
  mk('scripts/alpha.js', "require('./alpha-dep');\nmodule.exports={};\n");     // direct via workflow
  mk('scripts/alpha-dep.js', 'module.exports={};\n');                          // transitive from alpha
  mk('scripts/beta.js', 'module.exports={};\n');                              // direct via registry name
  mk('scripts/beta.spec.js', "require('./beta-spec-dep');\n");                 // spec pulls a helper
  mk('scripts/beta-spec-dep.js', 'module.exports={};\n');                      // transitive from beta spec
  mk('scripts/gamma.js', 'module.exports={};\n');                             // direct via hook-script
  mk('scripts/delta.js', 'module.exports={};\n');                             // direct via git-hook
  mk('scripts/orphan.js', "require('./orphan-dep');\nmodule.exports={};\n");   // unwired
  mk('scripts/orphan-dep.js', 'module.exports={};\n');                         // unwired (only orphan needs it)

  // Enforced roots
  mk('.github/workflows/ci.yml', 'jobs:\n  a:\n    steps:\n      - run: node scripts/alpha.js\n');
  mk('.github/scripts/check.sh', '#!/usr/bin/env bash\nnode scripts/gamma.js\n');
  mk('.githooks/pre-commit', '#!/usr/bin/env bash\nnode scripts/delta.js\n');
  mk(
    'inventory/harness-self-test-registry.json',
    JSON.stringify({ validators: [{ name: 'beta', spec: 'scripts/beta.spec.js' }] }, null, 2)
  );

  return rootDir;
}

ok('classifies wired vs unwired across workflow/hook/registry/transitive roots', () => {
  const rootDir = writeFixture();
  try {
    const res = audit.audit(rootDir);
    assert.deepStrictEqual(
      res.enforced,
      ['alpha', 'alpha-dep', 'beta', 'beta-spec-dep', 'delta', 'gamma'],
      'enforced set mismatch'
    );
    assert.deepStrictEqual(res.unwired, ['orphan', 'orphan-dep'], 'unwired set mismatch');
    assert.strictEqual(res.checkedValidators, 8);
    assert.strictEqual(res.enforcedCount, 6);
    assert.strictEqual(res.unwiredCount, 2);

    const byName = Object.fromEntries(res.report.map(r => [r.validator, r]));
    assert.strictEqual(byName['alpha'].wiring.via, 'direct');
    assert.strictEqual(byName['alpha-dep'].wiring.via, 'transitive');
    assert.strictEqual(byName['alpha-dep'].wiring.from, 'alpha');
    assert.strictEqual(byName['beta-spec-dep'].wiring.via, 'transitive');
    assert.strictEqual(byName['orphan'].wiring.via, 'none');
    // alpha's provenance names the workflow root.
    assert.ok(byName['alpha'].wiring.roots.some(r => r.kind === 'workflow'));
    assert.ok(byName['gamma'].wiring.roots.some(r => r.kind === 'hook-script'));
    assert.ok(byName['delta'].wiring.roots.some(r => r.kind === 'git-hook'));
    assert.ok(byName['beta'].wiring.roots.some(r => r.kind === 'self-test-registry'));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

ok('audit is deterministic (same input → identical output)', () => {
  const rootDir = writeFixture();
  try {
    assert.deepStrictEqual(audit.audit(rootDir), audit.audit(rootDir));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

// --- Real-tree smoke: stable invariants only (no coupling to churny wiring state) ---------------
ok('real repo tree: partition invariant + validator-discipline is enforced', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const res = audit.audit(repoRoot);
  assert.ok(res.checkedValidators >= 1, 'expected at least one validator');
  const all = res.report.map(r => r.validator).sort();
  const partition = [...res.enforced, ...res.unwired].sort();
  assert.deepStrictEqual(partition, all, 'enforced ∪ unwired must partition all validators');
  assert.strictEqual(new Set(all).size, all.length, 'validators must be unique');
  // validator-discipline is invoked by .github/workflows/validator-discipline.yml — a stable anchor.
  assert.ok(res.enforced.includes('validator-discipline'), 'validator-discipline should be enforced');
});

console.log(`\n# enforcement-wiring-audit.spec: ${passed} assertions passed`);
