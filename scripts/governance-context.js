'use strict';
// governance-context — inject canonical priority sentence + goal definitions
// into governed provider calls via wrapProviderCall opts.
// Refs Epic #2029 #2221. Mirrors goal_lens.py priority sentence at provider layer.

const PRIORITY_SENTENCE = 'Goal priority: G1 Governance > G2 Quality > G3 Zero Cost > G4 Privacy & Security > G5 Portability > G6 Resilience > G7 Throughput > G8 Observability > G9 Interoperability > G10 Maintainability.';
const DECISION_CHECK = 'Decision check: justify any lower-priority override with explicit evidence.';
// Epic #3391 (Option B): operator autonomy is a cross-cutting, always-on PRINCIPLE (not a ranked goal).
const AUTONOMY_PRINCIPLE = 'Operator autonomy (always-on principle): resolve reversible/low-risk work autonomously (free cross-model panel, never a bare client prompt); reach the human only at the 4 retained carve-outs (design/UAT/irreversible/security-weakening); never override C-G1 or C-G4; log the autonomy-vs-escalate decision (G8).';

const GOAL_DEFINITIONS = {
  G1: 'Governance: policy, role, provenance, ticket controls non-negotiable.',
  G2: 'Quality: maximize correctness and engineering value.',
  G3: 'Zero Cost: prefer local/fleet/free lanes before paid providers.',
  G4: 'Privacy & Security: keep sensitive context local unless explicit override.',
  G5: 'Portability: avoid user-specific coupling; settings-driven.',
  G6: 'Resilience: graceful degradation; fallback paths.',
  G7: 'Throughput: acceptable speed after higher-priority goals met.',
  G8: 'Observability: decisions visible, auditable, attributable.',
  G9: 'Interoperability: preserve compatibility across runtimes.',
  G10: 'Maintainability: code clarity, low cognitive overhead, durable structure.',
};

// P1-4 (#2231): keyword -> goal map. Keywords are words drawn from each goal's own
// name/definition (NOT synonyms — synonym expansion is out of scope for Phase-1).
const GOAL_KEYWORDS = {
  G1: ['governance', 'policy', 'provenance'],
  G2: ['quality', 'correctness'],
  G3: ['cost', 'free'],
  G4: ['privacy'],
  G5: ['portability'],
  G6: ['resilience', 'fallback'],
  G7: ['throughput'],
  G8: ['observability'],
  G9: ['interoperability'],
  G10: ['maintainability'],
};

/**
 * Escape regex metacharacters so a keyword is always matched literally (defensive —
 * today's keywords are alpha-only, but this prevents a future metachar keyword from
 * silently changing match semantics). Refs cross-family review #2231.
 * @param {string} text keyword to escape
 * @returns {string} regex-safe literal
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Precompile one case-insensitive whole-word (\b) regex per keyword at module load.
const GOAL_KEYWORD_RES = Object.fromEntries(
  Object.entries(GOAL_KEYWORDS).map(([key, words]) =>
    [key, words.map((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i'))]),
);

/**
 * AC1: case-insensitive, whole-word (\b) match of goal-keywords in `prompt`.
 * @param {string} prompt text to scan
 * @returns {string[]} deduplicated array (G-order) of formatted G-definition strings, [] on no match
 */
function expandKeywords(prompt) {
  if (typeof prompt !== 'string' || !prompt) return [];
  const out = [];
  for (const [key, regexes] of Object.entries(GOAL_KEYWORD_RES)) {
    if (regexes.some((regex) => regex.test(prompt))) out.push(`${key} ${GOAL_DEFINITIONS[key]}`);
  }
  return out;
}

function shouldInject(opts) {
  if (!opts) return false;
  if (opts.tier === 'diagnostic' || opts.tier === 'test') return false;
  if (opts.inject_goal_context === false) return false;
  return opts.inject_goal_context !== undefined ? Boolean(opts.inject_goal_context) : true;
}

function buildPrefix({ includeDefinitions } = {}) {
  const lines = [PRIORITY_SENTENCE, AUTONOMY_PRINCIPLE, DECISION_CHECK];
  if (includeDefinitions) {
    lines.push('Goal definitions:');
    for (const [key, def] of Object.entries(GOAL_DEFINITIONS)) {
      lines.push(`  ${key} ${def}`);
    }
  }
  return lines.join(' ');
}

function injectGoalContext(opts) {
  if (!shouldInject(opts)) return { systemPrefix: null, injected: false };
  const includeDefinitions = Boolean(opts && opts.include_goal_definitions);
  let systemPrefix = buildPrefix({ includeDefinitions });
  // AC5: when expand_goal_keywords is set, append the prompt's matched G-definitions
  // AFTER the PRIORITY_SENTENCE/DECISION_CHECK block (additive; default off).
  let expandedGoals = [];
  if (opts.expand_goal_keywords && typeof opts.prompt === 'string') {
    expandedGoals = expandKeywords(opts.prompt);
    if (expandedGoals.length) systemPrefix = `${systemPrefix} Goal context: ${expandedGoals.join(' ')}`;
  }
  return { systemPrefix, injected: true, includesDefinitions: includeDefinitions, expandedGoals };
}

function estimateOverheadTokens({ includeDefinitions } = {}) {
  const PRIORITY_LINE_TOKEN_EST = 30;
  const DEFINITIONS_TOKEN_EST = 180;
  return includeDefinitions ? PRIORITY_LINE_TOKEN_EST + DEFINITIONS_TOKEN_EST : PRIORITY_LINE_TOKEN_EST;
}

module.exports = { injectGoalContext, shouldInject, buildPrefix, expandKeywords,
  estimateOverheadTokens, PRIORITY_SENTENCE, AUTONOMY_PRINCIPLE, DECISION_CHECK,
  GOAL_DEFINITIONS, GOAL_KEYWORDS };
