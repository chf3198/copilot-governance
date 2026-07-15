// tier: 1
// adjudication-guardrail.js — cross-model adjudication guardrail primitive (#3401, Epic #3392 AC1).
//
// The harness must work end-to-end WITHOUT prompting the human "client" for routine
// operator decisions. When a decision genuinely needs "another opinion", this primitive
// runs a FREE, diverse cross-model panel that scores each option against the goal-lens
// (min(G…) >= 7) and returns the highest-rated option for the operator to execute —
// never a client prompt. Reuses the existing $0 dispatch substrate:
//   - fleet-decision-oracle.js  (dispatchOllama → Tailscale fleet qwen)
//   - free-cloud-dispatch.js    (callProvider / providerOrder → free-cloud families)
//
// Decision rule (Phase-0 #3393 accepted design, median 94):
//   design/UAT OR irreversible-destruction OR deliberate-security-weakening → human-carveout
//   trivial / state-derivable                                                → self-resolve
//   otherwise (options / needs-another-opinion)                              → adjudicate
//
// Anti-goal (binding, Epic #3392 §6): never weaken or delete a security/governance control
// to silence a prompt. A security-weakening option is routed to human-carveout, NOT executed.
'use strict';

const GOAL_KEYS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10'];
const MIN_GOAL_FLOOR = 7; // min(G…) >= 7 per the goal-lens contract
const DEFAULT_DIVERSITY_FLOOR = 3; // ≥3 distinct model families for a valid panel (G5 calibration)
const DEFAULT_PANEL_TIMEOUT_MS = 60_000;
const SLOW_MODEL_PROMPT_THRESHOLD = 1500; // prompts longer than this route to the slow fleet model

// Map free-cloud provider id → model family, so the panel can require DISTINCT families
// (jury-of-diverse-models beats N copies of one family — arXiv 2404.18796). The fleet
// path contributes the 'qwen' family.
const PROVIDER_FAMILY = {
  gemini: 'gemini',
  'openrouter-free': 'llama',
  groq: 'llama',
  cerebras: 'llama',
  mistral: 'mistral',
  'github-models': 'openai',
  nvidia: 'llama',
  sambanova: 'llama',
};

// Conservative signal sets — keyword detectors are intentionally narrow so the guardrail
// does NOT over-route routine clarifications to the human (Phase-0 anti-over-block, mirrors
// credential-availability.js#classifyCredentialRequest).
const HUMAN_CARVEOUT = {
  designUAT: /\b(design direction|visual design|UAT|user acceptance|look and feel|brand|aesthetic)\b/i,
  irreversible: /\b(irreversible|destroy|permanently delete|wipe|unrecoverable|force[- ]push to main|drop (?:database|table))\b/i,
  securityWeakening: /\bdisable\b[\w\s]{0,40}\b(?:guard|gate|check|protection|control|enforcement)\b|\bweaken\b[\w\s]{0,20}\b(?:security|control|gate|guard)\b|\bremove\b[\w\s]{0,30}\b(?:security|governance)\b[\w\s]{0,15}\bcontrol\b|\b(?:broaden|widen)\b[\w\s]{0,15}\bpermissions?\b|\bgrant\b[\w\s]{0,15}\bbypass\b/i,
};
const TRIVIAL = /\b(typo|formatting|rename|whitespace|lockfile|version bump|comment wording)\b/i;

function median(nums) {
  const xs = nums.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!xs.length) return NaN;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * Risk-tier a decision against the Phase-0 decision rule.
 * @param {{question:string, options?:Array, flags?:object}} decision
 * @returns {{route:'human-carveout'|'self-resolve'|'adjudicate', tier:string, reason:string}}
 */
function classifyDecision(decision) {
  const questionText = (decision && decision.question) || '';
  const flags = (decision && decision.flags) || {};
  const options = (decision && decision.options) || [];

  // 1. Human carve-outs — the ONLY sanctioned client touchpoints.
  if (flags.designOrUAT || HUMAN_CARVEOUT.designUAT.test(questionText)) {
    return { route: 'human-carveout', tier: 'design-uat', reason: 'design direction / UAT is the client role' };
  }
  if (flags.irreversible || HUMAN_CARVEOUT.irreversible.test(questionText)) {
    return { route: 'human-carveout', tier: 'irreversible', reason: 'irreversible/destructive real-world action' };
  }
  if (flags.securityWeakening || HUMAN_CARVEOUT.securityWeakening.test(questionText)) {
    return { route: 'human-carveout', tier: 'security-weakening', reason: 'deliberate security-policy weakening (anti-goal)' };
  }
  // 2. Trivial / state-derivable → self-resolve, NO panel (G3 zero-cost).
  if (flags.trivial || flags.stateDerivable || TRIVIAL.test(questionText)) {
    return { route: 'self-resolve', tier: 'trivial', reason: 'trivial or state-derivable; operator resolves directly' };
  }
  // 3. Genuine options / needs-another-opinion → adjudicate.
  if (options.length >= 2 || flags.needsOpinion) {
    return { route: 'adjudicate', tier: 'options', reason: 'multiple options / needs another opinion' };
  }
  // Single, non-trivial, non-carveout question with no options → operator resolves directly.
  return { route: 'self-resolve', tier: 'single-question', reason: 'no competing options; operator resolves directly' };
}

/** Build the goal-lens scoring prompt for one panelist. */
function buildPanelPrompt(question, options, groundingContext) {
  const lens = 'Goal-lens (priority order): G1 Governance > G2 Quality > G3 Zero-Cost > G4 Privacy/Security '
    + '> G5 Portability > G6 Resilience > G7 Throughput > G8 Observability > G9 Interoperability > G10 Maintainability. '
    + 'Plus the cross-cutting Operator-Autonomy principle (Epic #3391): prefer options that keep the harness '
    + 'autonomous (resolve reversibly without a human); reaching the client is only correct for the 4 retained '
    + 'carve-outs (design/UAT/irreversible/security-weakening) and never overrides C-G1/C-G4.';
  const optsBlock = options.map((o, i) => `OPTION ${i + 1}: ${typeof o === 'string' ? o : o.label || JSON.stringify(o)}`).join('\n');
  const grounding = groundingContext ? `\nCURRENT BEST-PRACTICE CONTEXT (websearch-grounded):\n${groundingContext}\n` : '';
  return `You are one panelist in a cross-model adjudication jury. Score each option against the goal-lens.
${lens}
${grounding}
DECISION: ${question}

${optsBlock}

For EACH option output exactly one line:
SCORE <n>: <0-100 overall> MINGOAL <0-10 lowest single-goal score> :: <one-line rationale>
Then a final line: PICK <option-number>`;
}

/** Parse a panelist response into per-option {score, minGoal} plus its top pick. */
function parsePanelResponse(text, optionCount) {
  const scores = [];
  const re = /SCORE\s+(\d+)\s*:\s*(\d+)\s+MINGOAL\s+(\d+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const idx = parseInt(m[1], 10);
    if (idx >= 1 && idx <= optionCount) {
      scores[idx - 1] = { score: parseInt(m[2], 10), minGoal: parseInt(m[3], 10) };
    }
  }
  const pickMatch = text.match(/PICK\s+(\d+)/i);
  const pick = pickMatch ? parseInt(pickMatch[1], 10) : null;
  return { scores, pick };
}

/** Aggregate panelist scores by MEDIAN per option; choose highest median honoring min(G…)>=7. */
function aggregate(panelResults, optionCount) {
  const perOption = [];
  for (let i = 0; i < optionCount; i++) {
    const scoreList = panelResults.map((r) => r.scores[i] && r.scores[i].score).filter(Number.isFinite);
    const minGoalList = panelResults.map((r) => r.scores[i] && r.scores[i].minGoal).filter(Number.isFinite);
    perOption.push({
      option: i + 1,
      medianScore: median(scoreList),
      medianMinGoal: median(minGoalList),
      votes: scoreList.length,
    });
  }
  // Eligible = honors the min-goal floor; never auto-pick an option that violates the goal-lens.
  const eligible = perOption.filter((o) => Number.isFinite(o.medianMinGoal) && o.medianMinGoal >= MIN_GOAL_FLOOR);
  const pool = eligible.length ? eligible : perOption;
  // Guard the empty-pool case (no options, or every panelist failed to score):
  // chosen is explicitly null, never undefined, so callers never read `.option` off undefined.
  const ranked = pool.slice().sort((a, b) => (b.medianScore || 0) - (a.medianScore || 0));
  const chosen = ranked.length ? ranked[0] : null;
  return { perOption, chosen, goalLensRespected: eligible.length > 0 };
}

/**
 * Deterministic self-resolution fallback — used for trivial/state-derivable decisions and
 * whenever the panel cannot reach the diversity floor or times out. NEVER prompts the client,
 * NEVER throws. Picks the first option (caller-ordered = operator preference) with an explicit
 * "fallback" rationale so the audit log shows it was not a full-panel verdict.
 */
function selfResolve(question, options, reason) {
  const chosen = options && options.length ? 1 : null;
  return {
    route: 'self-resolve',
    chosen,
    chosenLabel: chosen ? labelOf(options[0]) : null,
    rationale: `self-resolved (${reason}); operator-internal decision, no client prompt`,
    degraded: true,
    panel: [],
    diversity: 0,
  };
}

function labelOf(o) { return typeof o === 'string' ? o : (o && (o.label || JSON.stringify(o))); }

/**
 * Run the cross-model adjudication panel for a decision with options.
 * @param {string} question
 * @param {Array} options
 * @param {object} [opts]
 *   - diversityFloor: number (default 3 distinct families)
 *   - timeoutMs: per-call timeout
 *   - groundingContext: string injected only for novel/high-stakes (websearch-grounded, G3)
 *   - highStakes / novel: booleans (caller gates websearch upstream)
 *   - dispatchFleet(prompt,opts) / dispatchProvider(name,prompt,opts): injectable for tests
 *   - providers: ordered free-cloud provider ids (default providerOrder())
 *   - logger(record): optional decision-log sink (A5 wires the real audit stream)
 * @returns {Promise<object>} adjudication record
 */
/**
 * Gather one panelist response per DISTINCT model family until the diversity floor is met
 * (or candidates are exhausted). Fleet qwen first, then free-cloud families, deduped by family.
 * @param {string} prompt
 * @param {object} opts dispatch fns, providers, floor, timeoutMs
 * @returns {Promise<{panel:Array, families:Set}>}
 */
async function gatherDiversePanel(prompt, opts) {
  const { floor, timeoutMs } = opts;
  const dispatchFleet = opts.dispatchFleet || defaultFleetDispatch;
  const dispatchProvider = opts.dispatchProvider || defaultProviderDispatch;
  const providerIds = opts.providers || defaultProviderOrder();
  const families = new Set();
  const panel = [];
  const fleet = await safeCall(() => dispatchFleet(prompt, { timeoutMs }), timeoutMs);
  if (fleet && fleet.ok && fleet.text) { panel.push({ family: 'qwen', provider: 'fleet-qwen', text: fleet.text }); families.add('qwen'); }
  for (const id of providerIds) {
    if (families.size >= floor) break;
    const fam = PROVIDER_FAMILY[id] || id;
    if (families.has(fam)) continue; // enforce DISTINCT families (diversity, not redundancy)
    const res = await safeCall(() => dispatchProvider(id, prompt, { timeoutMs }), timeoutMs);
    if (res && res.ok && res.text) { panel.push({ family: fam, provider: id, text: res.text }); families.add(fam); }
  }
  return { panel, families };
}

// Resolve web-research grounding for a novel/high-stakes decision (R1 of #3059, #3747).
// Caller-supplied groundingContext wins; else auto-produce via the grounding producer. Fail-safe:
// any producer failure yields null => the panel runs consensus-without-grounding (never a client prompt).
async function resolveGrounding(question, opts) {
  if (!(opts.highStakes || opts.novel)) return null;
  if (opts.groundingContext) return opts.groundingContext;
  try {
    const produce = opts.produceGrounding || require('./adjudication-grounding').produceGrounding;
    const produced = await produce(question, opts.groundingOpts || {});
    return produced && produced.grounding ? produced.grounding : null;
  } catch { return null; }
}

async function adjudicate(question, options = [], opts = {}) {
  const floor = opts.diversityFloor || DEFAULT_DIVERSITY_FLOOR;
  const timeoutMs = opts.timeoutMs || DEFAULT_PANEL_TIMEOUT_MS;
  const groundingContext = await resolveGrounding(question, opts);
  const prompt = buildPanelPrompt(question, options, groundingContext);
  const { panel, families } = await gatherDiversePanel(prompt, { ...opts, floor, timeoutMs });

  // G5 minimum-diversity floor — below floor degrades to self-resolution, never a client prompt.
  if (families.size < floor) {
    const out = selfResolve(question, options, `panel diversity ${families.size}/${floor} below floor`);
    out.diversity = families.size;
    out.panel = panel.map((p) => p.provider);
    logDecision(opts.logger, { question, ...out });
    return out;
  }

  const parsed = panel.map((p) => ({ provider: p.provider, family: p.family, ...parsePanelResponse(p.text, options.length) }));
  const record = buildAdjudicationRecord(parsed, aggregate(parsed, options.length), options, families.size);
  logDecision(opts.logger, { question, ...record });
  return record;
}

/** Assemble the adjudication record from the parsed panel + aggregate result. */
function buildAdjudicationRecord(parsed, agg, options, diversity) {
  return {
    route: 'adjudicate',
    chosen: agg.chosen ? agg.chosen.option : null,
    chosenLabel: agg.chosen ? labelOf(options[agg.chosen.option - 1]) : null,
    score: agg.chosen ? agg.chosen.medianScore : NaN,
    minGoal: agg.chosen ? agg.chosen.medianMinGoal : NaN,
    goalLensRespected: agg.goalLensRespected,
    rationale: agg.goalLensRespected
      ? `highest median goal-lens score across ${diversity} families`
      : `no option cleared min(G…)>=${MIN_GOAL_FLOOR}; chose least-bad median (operator should review)`,
    diversity,
    panel: parsed,
    perOption: agg.perOption,
    degraded: false,
  };
}

/**
 * Top-level entry: classify a decision and resolve it WITHOUT a client prompt unless a
 * human carve-out applies. Returns the adjudication/self-resolution record, or a
 * human-carveout marker the caller must honor (the only path that may reach the client).
 */
async function decide(decision, opts = {}) {
  const cls = classifyDecision(decision);
  if (cls.route === 'human-carveout') {
    const record = { route: 'human-carveout', tier: cls.tier, rationale: cls.reason, question: decision.question };
    logDecision(opts.logger, record);
    return record;
  }
  if (cls.route === 'self-resolve') {
    const out = selfResolve(decision.question, decision.options || [], cls.reason);
    logDecision(opts.logger, { question: decision.question, ...out });
    return out;
  }
  return adjudicate(decision.question, decision.options || [], opts);
}

function logDecision(logger, record) {
  if (typeof logger === 'function') { try { logger(record); } catch { /* logging must never break the decision */ } }
}

// ---- default real-substrate wiring (kept thin; injected fakes used in tests) ----

async function safeCall(fn, timeoutMs) {
  try {
    return await Promise.race([
      fn(),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, text: '', reason: 'timeout' }), timeoutMs + 1000)),
    ]);
  } catch (err) {
    return { ok: false, text: '', reason: `error:${err && err.message}` };
  }
}

function defaultProviderOrder() {
  try { return require('./free-cloud-dispatch').providerOrder(); } catch { return Object.keys(PROVIDER_FAMILY); }
}

async function defaultFleetDispatch(prompt, { timeoutMs } = {}) {
  try {
    const oracle = require('./fleet-decision-oracle');
    const model = prompt.length > SLOW_MODEL_PROMPT_THRESHOLD ? oracle.SLOW_MODEL : oracle.FAST_MODEL;
    const res = await oracle.dispatchOllama({ host: oracle.DEFAULT_HOST, model, prompt, timeoutMs: timeoutMs || DEFAULT_PANEL_TIMEOUT_MS });
    return { ok: !!(res && res.ok), text: (res && res.response) || '' };
  } catch (err) { return { ok: false, text: '', reason: `fleet:${err && err.message}` }; }
}

async function defaultProviderDispatch(name, prompt) {
  try {
    const fc = require('./free-cloud-dispatch');
    const res = await fc.callProvider(name, prompt);
    return { ok: !!(res && res.ok), text: (res && res.content) || '', reason: res && res.reason };
  } catch (err) { return { ok: false, text: '', reason: `provider:${err && err.message}` }; }
}

module.exports = {
  classifyDecision, adjudicate, decide, selfResolve,
  buildPanelPrompt, parsePanelResponse, aggregate, median, resolveGrounding,
  PROVIDER_FAMILY, GOAL_KEYS, MIN_GOAL_FLOOR, DEFAULT_DIVERSITY_FLOOR,
};
