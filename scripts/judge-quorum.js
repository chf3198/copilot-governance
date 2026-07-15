// judge-quorum.js — HAMR Wave 1: 2-of-N family-independent judge gate (#895)
// Independence-based quorum; dispatcher injected for testability (Wave 4 wires real dispatch).
'use strict';

/** @type {Record<string, Array<{model: string, provenance: string}>>} */
const FAMILY_REGISTRY = {
  qwen:    [{ model: 'qwen-3-235b@cerebras', provenance: 'vendor-attested' },
            { model: 'qwen2.5-coder:32b@36gbwinresource', provenance: 'unverified' }],
  llama:   [{ model: 'llama-3.3-70b-versatile@groq', provenance: 'vendor-attested' },
            { model: 'llama3.3:70b@windows-laptop', provenance: 'unverified' }],
  claude:  [{ model: 'claude-sonnet-4-6@anthropic', provenance: 'vendor-attested' },
            { model: 'claude-opus-4-7@anthropic', provenance: 'vendor-attested' }],
  gemini:  [{ model: 'gemini-2.5-flash@google', provenance: 'vendor-attested' }],
  mistral: [{ model: 'mistral:latest@penguin-1', provenance: 'unverified' }],
};
const ATTESTED = new Set(['vendor-attested', 'source-built', 'hardware-rooted']);

/** Return a shallow copy of the family registry.
 * @returns {Record<string, Array<{model: string, provenance: string}>>} Registry copy.
 */
function judgeFamilies() {
  return Object.fromEntries(Object.entries(FAMILY_REGISTRY).map(([k, v]) => [k, [...v]]));
}

/** Default dispatcher — throws to surface missing injection errors.
 * @param {string} _m - Model.
 * @param {string} _p - Prompt.
 * @returns {Promise<never>} Throws.
 */
async function defaultDispatcher(_m, _p) {
  throw new Error('no dispatcher configured — inject options.dispatcher');
}

function preferAttested(entries) {
  return entries.find(e => ATTESTED.has(e.provenance)) ?? entries[0];
}

function selectPair(gateType) {
  const order = ['qwen', 'llama', 'claude', 'gemini', 'mistral'];
  const cands = order.map(f => ({ family: f, ...preferAttested(FAMILY_REGISTRY[f]) }));
  if (gateType !== 'closeout') return [cands[0], cands[1]];
  const first = cands.find(c => ATTESTED.has(c.provenance)) ?? cands[0];
  const second = cands.find(c => c.family !== first.family) ?? cands[1];
  return [first, second];
}

async function callOne(spec, prompt, dispatch) {
  const { score } = await dispatch(spec.model, prompt);
  return { family: spec.family, model: spec.model, score, provenance: spec.provenance };
}

/** Run the judge quorum gate.
 * @param {string} prompt - Text to evaluate.
 * @param {{gateType?: 'routine'|'stage2'|'closeout', dispatcher?: Function, models?: string[]}} options - Options.
 * @returns {Promise<{score: number, agreement: boolean, judges: object[], disagreement_reason?: string}>} Result.
 */
async function judge(prompt, options = {}) {
  const { gateType = 'routine', dispatcher = defaultDispatcher } = options;
  if (gateType === 'routine') {
    const entry = preferAttested(FAMILY_REGISTRY.qwen);
    const judgeResult = await callOne({ family: 'qwen', ...entry }, prompt, dispatcher);
    return { score: judgeResult.score, agreement: true, judges: [judgeResult] };
  }
  const pair = selectPair(gateType);
  const results = await Promise.all(pair.map(j => callOne(j, prompt, dispatcher)));
  const diff = Math.abs(results[0].score - results[1].score);
  const mean = (results[0].score + results[1].score) / 2;
  if (diff > 0.10) {
    return { score: mean, agreement: false, judges: results,
      disagreement_reason: `score_diff_${diff.toFixed(2)}` };
  }
  return { score: mean, agreement: true, judges: results };
}

/** Escalate disagreement to a 3rd judge from a different family.
 * @param {string} prompt - Text to evaluate.
 * @param {object[]} prevJudges - The two disagreeing judge records.
 * @param {Function} [dispatcher] - Injected dispatch function.
 * @returns {Promise<{score: number|null, judge?: object, reason?: string}>} Escalation result.
 */
async function escalate(prompt, prevJudges, dispatcher = defaultDispatcher) {
  const used = new Set(prevJudges.map(j => j.family));
  const third = Object.keys(FAMILY_REGISTRY).find(f => !used.has(f));
  if (!third) return { score: null, reason: 'no_third_family_available' };
  const entry = preferAttested(FAMILY_REGISTRY[third]);
  const judgeResult = await callOne({ family: third, ...entry }, prompt, dispatcher);
  return { score: judgeResult.score, judge: judgeResult };
}

module.exports = { judge, judgeFamilies, escalate };
