#!/usr/bin/env node
// cedar-pilot — pilot harness for Cedar policy-as-code substrate evaluation
// against the existing JS signer-alias-canonical implementation.
// Per #1970 (Epic #1962 C5). Comparative pair with C10 (#1988) MS Toolkit pilot.
//
// MVP scope (this PR): scaffolding + replay corpus + comparison report skeleton.
// Cedar runtime binding (@cedar-policy/cedar-wasm or amazon/cedar-rust-cli)
// is a Phase-2 follow-on per #1970 amended AC.
//
// G4: no credential surface. G6: degraded mode = fall back to JS impl on
// any Cedar parse/eval error.

'use strict';
const fs = require('fs');
const path = require('path');

const POLICY_DIR = path.join(__dirname, '..', '..', 'inventory', 'cedar-policies');
const CORPUS_DIR = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'cedar-replay');
const PCT_BASIS_POINTS = 10000;

/** Load a Cedar policy text by name (without .cedar extension).
 * @param {string} name - policy filename stem.
 * @returns {string} the raw .cedar policy text. */
function loadPolicy(name) {
  return fs.readFileSync(path.join(POLICY_DIR, `${name}.cedar`), 'utf8');
}

/** Load all replay-corpus fixtures.
 * @returns {Array} array of fixture objects. */
function loadCorpus() {
  if (!fs.existsSync(CORPUS_DIR)) return [];
  return fs.readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      ...JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, f), 'utf8')),
      _path: path.join(CORPUS_DIR, f),
    }));
}

/** Validate fixture has required keys for Cedar eval.
 * @param {object} fixture - fixture object.
 * @returns {object} { ok, missing }. */
function validateFixture(fixture) {
  const required = ['id', 'principal', 'action', 'resource', 'expected_decision'];
  const missing = required.filter((k) => !(k in fixture));
  return { ok: missing.length === 0, missing };
}

/** Evaluate a fixture against the JS reference implementation.
 * Per AC3 list: this skeleton documents JS edge cases Cedar cannot natively
 * express. Each non-trivial case enumerated here is a P2 follow-on candidate.
 * @param {object} _fixture - fixture object (skeleton; full eval is follow-on).
 * @returns {object} { decision, runtime: 'js-skeleton', edge_case_notes }. */
function evaluateJs(_fixture) {
  return {
    decision: 'permit',
    runtime: 'js-skeleton',
    edge_case_notes: [],
  };
}

/** Evaluate a fixture against Cedar (skeleton placeholder).
 * Full impl requires @cedar-policy/cedar-wasm dep — Phase-2 follow-on.
 * @param {object} _fixture - fixture object (skeleton).
 * @returns {object} { decision, runtime: 'cedar-skeleton', notes }. */
function evaluateCedar(_fixture) {
  return {
    decision: 'permit',
    runtime: 'cedar-skeleton',
    notes: 'Cedar runtime install deferred to Phase-2 follow-on per #1970 amendment',
  };
}

/** Run the replay-eval comparison across the corpus.
 * @returns {object} per-fixture comparison + aggregate parity. */
function replayEval() {
  const corpus = loadCorpus();
  const results = corpus.map((fixture) => ({
    id: fixture.id,
    expected: fixture.expected_decision,
    js: evaluateJs(fixture),
    cedar: evaluateCedar(fixture),
    parity: true, // skeleton: both return permit; full impl will compare
  }));
  const total = results.length;
  const matched = results.filter((r) => r.parity).length;
  return {
    total,
    matched,
    parity_pct: total ? Math.round((matched / total) * PCT_BASIS_POINTS) / 100 : 0,
    results,
    pilot_phase: 'mvp-scaffolding',
    full_eval_status: 'deferred-to-phase-2',
  };
}

if (require.main === module) {
  const report = replayEval();
  console.log(JSON.stringify(report, null, 2));
}

module.exports = {
  loadPolicy, loadCorpus, validateFixture, evaluateJs, evaluateCedar,
  replayEval, POLICY_DIR, CORPUS_DIR,
};
