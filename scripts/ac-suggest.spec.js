'use strict';

// Spec for ac-suggest (Epic #1299 — AI-suggested acceptance criteria with the epic-ac-reconcile.js
// measurability backstop). Node built-ins only; self-executing; exits non-zero on the first
// assertion failure so CI treats it as a hard test. Sibling-spec + registry entry added under the
// #1299 reconciliation (validator-discipline, #1893 VD1/VD2) — the impl shipped as #3818 baseline
// drift without either.

const assert = require('node:assert');
const path = require('node:path');
const {
  classifyMeasurability,
  reconcileSuggestions,
  validateSuggestions,
  suggestACs,
  parseSuggestionJson,
  fallbackSuggest,
  logMeasurement,
  EVIDENCE_SOURCES,
} = require('./ac-suggest');
const replay = require('./ac-suggest-replay-eval');

// ── classifyMeasurability — one true positive per evidence anchor ────────────
{
  const child = classifyMeasurability('AC reconciler emits JSON for child #1289');
  assert.strictEqual(child.measurable, true, 'closed_child: #N must be measurable');
  assert.strictEqual(child.evidence_source, 'closed_child');

  const file = classifyMeasurability('scripts/ac-suggest.js exists');
  assert.strictEqual(file.measurable, true, 'file_existence: a filename must be measurable');
  assert.strictEqual(file.evidence_source, 'file_existence');

  const metric = classifyMeasurability('false-positive rate is under 5%');
  assert.strictEqual(metric.measurable, true, 'sensor_output: a numeric metric must be measurable');
  assert.strictEqual(metric.evidence_source, 'sensor_output');

  const gh = classifyMeasurability('the PR is merged into main');
  assert.strictEqual(gh.measurable, true, 'native_github_api: merge state must be measurable');
  assert.strictEqual(gh.evidence_source, 'native_github_api');
}

// ── classifyMeasurability — honest negatives (the FP-avoidance the design promises) ──
{
  assert.strictEqual(classifyMeasurability('improve latency').measurable, false,
    'metric word with NO number is aspirational, not measurable (#1302 review)');
  assert.strictEqual(classifyMeasurability('double-check the logic before we ship').measurable, false,
    '"check" inside "double-check" must not match the github-state anchor');
  assert.strictEqual(classifyMeasurability('make the code more robust').measurable, false,
    'pure aspiration has no evidence anchor');
  assert.strictEqual(classifyMeasurability('').measurable, false, 'empty text is not measurable');
  assert.ok(classifyMeasurability('anything unmeasurable').reason, 'a rejection must carry a reason');
}

// ── parseSuggestionJson — extraction, cap, filtering, garbage rejection ──────
{
  const ok = parseSuggestionJson('noise [{"text":"a #1","evidence_source":"closed_child"}] tail');
  assert.strictEqual(ok.length, 1, 'must extract the embedded JSON array');
  assert.strictEqual(ok[0].id, 'AC1', 'must synthesize an AC id when absent');

  const many = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ text: 'AC body ' + i })));
  assert.strictEqual(parseSuggestionJson(many).length, 7, 'must cap at 7 ACs');

  const filtered = parseSuggestionJson('[{"text":"keep"},{"text":"   "}]');
  assert.strictEqual(filtered.length, 1, 'must drop empty-text entries');

  assert.strictEqual(parseSuggestionJson('not json at all'), null, 'garbage → null');
  assert.strictEqual(parseSuggestionJson('[]'), null, 'empty array → null');
}

// ── fallbackSuggest — deterministic, never empty, only measurable seeds (G6) ──
{
  const seeded = fallbackSuggest('scripts/ac-suggest.js must exist. Something aspirational and vague.');
  assert.ok(seeded.length >= 1, 'fallback must always yield at least one AC');
  assert.ok(seeded.every((s) => classifyMeasurability(s.text).measurable),
    'every fallback AC must itself be measurable');

  const fromNothing = fallbackSuggest('improve things generally');
  assert.strictEqual(fromNothing.length, 1, 'no measurable clause → single synthetic escape-hatch AC');
  assert.match(fromNothing[0].text, /Deliverable file exists/,
    'last-resort AC is the deterministic escape hatch (the backstop may still reject it — never invents metrics)');
}

// ── reconcile/validate — measurable accepted, aspirational rejected ──────────
{
  const suggestions = [
    { id: 'AC1', text: 'scripts/ac-suggest.js exists' },      // file_existence → accept
    { id: 'AC2', text: 'child #1289 is closed' },             // closed_child   → accept
    { id: 'AC3', text: 'make everything better' },            // aspirational   → reject
  ];
  const { accepted, rejected, verdicts } = validateSuggestions(suggestions);
  assert.strictEqual(verdicts.length, 3, 'one verdict per suggestion');
  assert.deepStrictEqual(accepted.map((a) => a.ac_id).sort(), ['AC1', 'AC2'], 'measurable ACs accepted');
  assert.deepStrictEqual(rejected.map((r) => r.ac_id), ['AC3'], 'aspirational AC rejected');
  assert.ok(reconcileSuggestions(suggestions).every((v) => 'accepted' in v), 'verdict carries accepted flag');
}

// ── suggestACs — injected dispatch (LLM path) and failure (fallback path) ────
(async () => {
  const empty = await suggestACs('');
  assert.strictEqual(empty.source, 'none', 'empty problem statement → source none');
  assert.strictEqual(empty.suggestions.length, 0);

  const llm = await suggestACs('draft ACs', {
    dispatch: async () => ({ ok: true, content: '[{"text":"config.json exists"}]', provider: 'test-fleet' }),
  });
  assert.strictEqual(llm.source, 'test-fleet', 'ok dispatch → provider-sourced suggestions');
  assert.strictEqual(llm.suggestions[0].text, 'config.json exists');

  const fell = await suggestACs('scripts/x.js exists', { dispatch: async () => ({ ok: false }) });
  assert.strictEqual(fell.source, 'offline-fallback', 'failed dispatch → offline fallback (G6)');
  assert.ok(fell.suggestions.length >= 1);

  // ── logMeasurement — best-effort, must never throw (redirect to a temp log) ──
  process.env.AC_SUGGEST_LOG = path.join(process.env.TMPDIR || '/tmp', 'ac-suggest-spec.jsonl');
  assert.doesNotThrow(() => logMeasurement({ mode: 'spec', accepted: 1, rejected: 0 }));

  // ── invariants + corpus-integrity guard (ties AC5 <5% FP-rate to CI) ────────
  assert.deepStrictEqual(EVIDENCE_SOURCES,
    ['native_github_api', 'closed_child', 'file_existence', 'sensor_output'],
    'evidence taxonomy must match the reconciler EVIDENCE_RANK keys');

  const evalResult = replay.run();
  assert.ok(evalResult.total >= 20, 'corpus must be non-trivial (>=20 labeled samples)');
  assert.ok(evalResult.meetsBar, `AC5: corpus FP-rate ${evalResult.fpRate} must be < ${evalResult.fpRateBar}`);

  console.log(`ac-suggest.spec: OK — corpus ${evalResult.total} samples, FP-rate=${evalResult.fpRate} (<${evalResult.fpRateBar})`);
})().catch((err) => { console.error(err); process.exit(1); });
