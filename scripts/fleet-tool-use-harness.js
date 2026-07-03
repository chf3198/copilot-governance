/**
 * Fleet Advisor — fleet tool-use reliability harness (Epic #3414 #3487, §Q5/§8.5).
 *
 * Fleet models are the reliable substrate for agentic tool-use ONLY when their structured output can be
 * trusted. This harness makes that measurable + enforceable:
 *   1. grammar/JSON-schema-constrained dispatch with a bounded retry-on-malformed loop — the schema is
 *      threaded to the fleet (`format`), and a parse failure triggers a deterministic re-prompt.
 *   2. a chain router — only well-specified, short (<=2-call) chains go to the fleet; longer or
 *      underspecified chains escalate (the fleet is not a long-horizon agent).
 *   3. a measured reliability bar — `measureReliability` computes the parse rate over samples; the fleet
 *      is not promoted to default reviewer until it clears RELIABILITY_BAR.
 *
 * Dispatch is injected (pure + testable). No network in the tested path.
 */
'use strict';

// The fleet may only carry SHORT tool-call chains; longer chains need a stronger long-horizon model.
const MAX_FLEET_CHAIN = 2;
// Parse-rate the fleet must clear before it is trusted as the default tool-use reviewer.
const RELIABILITY_BAR = 0.9;
const DEFAULT_MAX_RETRIES = 2;

/**
 * Scan text for every top-level BALANCED {...} substring. Models routinely wrap JSON in prose or emit a
 * throwaway brace group before the real object, so we collect all candidates rather than a naive
 * first-brace-to-last-brace slice (which fails on sibling groups). String-literal aware.
 */
function extractJsonCandidates(text) {
  const candidates = [];
  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { if (depth === 0) startIndex = i; depth += 1; }
    else if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && startIndex !== -1) candidates.push(text.slice(startIndex, i + 1));
    }
  }
  return candidates;
}

/** Validate a parsed object against a minimal schema ({ required, properties }). */
function matchesSchema(value, schema) {
  for (const key of schema.required || []) {
    if (value[key] === undefined || value[key] === null) return `missing-field:${key}`;
  }
  for (const [key, type] of Object.entries(schema.properties || {})) {
    if (value[key] !== undefined && typeof value[key] !== type) return `wrong-type:${key}`;
  }
  return null;
}

/**
 * Extract + validate a tool call from model output against a minimal schema
 * ({ required: [...], properties: { k: 'string'|'number'|... } }). Tries every balanced JSON candidate
 * and returns the FIRST that both parses and satisfies the schema. Returns { ok, value } or
 * { ok:false, reason }. Never throws.
 */
function parseToolCall(text, schema = {}) {
  if (typeof text !== 'string') return { ok: false, reason: 'non-string-output' };
  const fenced = text.replace(/```(?:json)?/gi, '');
  const candidates = extractJsonCandidates(fenced);
  if (candidates.length === 0) return { ok: false, reason: 'no-json-found' };
  let lastReason = 'invalid-json';
  for (const candidate of candidates) {
    let value;
    try {
      value = JSON.parse(candidate);
    } catch (err) {
      lastReason = `invalid-json:${err.message}`;
      continue;
    }
    const schemaError = matchesSchema(value, schema);
    if (schemaError) { lastReason = schemaError; continue; }
    return { ok: true, value };
  }
  return { ok: false, reason: lastReason };
}

/** Build the deterministic re-prompt appended after a malformed response (schema reinforcement). */
function reinforcePrompt(prompt, schema, reason) {
  const fields = (schema.required || []).join(', ') || 'the required fields';
  return `${prompt}\n\nYour previous response was rejected (${reason}). Reply with ONLY a valid JSON object containing: ${fields}. No prose, no code fences.`;
}

/**
 * Grammar-constrained tool dispatch with bounded retry-on-malformed. `dispatch(prompt, { format })`
 * is injected; `format` carries the schema so a schema-aware backend (Ollama structured output /
 * XGrammar) can constrain generation. Returns { ok, value, attempts, reason } and a reliability sample.
 */
async function constrainedToolDispatch(prompt, schema, opts = {}) {
  const dispatch = opts.dispatch;
  const maxRetries = opts.maxRetries != null ? opts.maxRetries : DEFAULT_MAX_RETRIES;
  if (typeof dispatch !== 'function') return { ok: false, reason: 'no-dispatch', attempts: 0 };
  let attempt = 0;
  let currentPrompt = prompt;
  let lastReason = 'unknown';
  while (attempt <= maxRetries) {
    attempt += 1;
    let raw;
    try {
      raw = await dispatch(currentPrompt, { format: schema });
    } catch (err) {
      lastReason = `dispatch-error:${err.message}`;
      continue;
    }
    const text = typeof raw === 'string' ? raw : (raw && (raw.content || raw.text)) || '';
    const parsed = parseToolCall(text, schema);
    if (parsed.ok) return { ok: true, value: parsed.value, attempts: attempt, reason: null };
    lastReason = parsed.reason;
    currentPrompt = reinforcePrompt(prompt, schema, parsed.reason);
  }
  return { ok: false, reason: lastReason, attempts: attempt };
}

/**
 * Route a tool-call chain. Well-specified chains of <= MAX_FLEET_CHAIN steps go to the fleet; longer or
 * underspecified chains escalate. Returns { route: 'fleet'|'escalate', reason }.
 */
function routeToolChain(chain, opts = {}) {
  const steps = Array.isArray(chain) ? chain : [];
  if (steps.length === 0) return { route: 'escalate', reason: 'empty-chain' };
  if (steps.length > (opts.maxFleetChain || MAX_FLEET_CHAIN)) {
    return { route: 'escalate', reason: `chain-too-long:${steps.length}` };
  }
  const underspecified = steps.some((step) => !step || !step.tool || !step.schema);
  if (underspecified) return { route: 'escalate', reason: 'underspecified-step' };
  return { route: 'fleet', reason: 'well-specified-short-chain' };
}

/**
 * Measure tool-call reliability over a set of { output, schema, shouldParse } samples: the parse rate
 * plus whether it clears RELIABILITY_BAR. This is the gate that promotes the fleet to default reviewer.
 */
function measureReliability(samples, opts = {}) {
  const list = Array.isArray(samples) ? samples : [];
  if (list.length === 0) return { total: 0, parsed: 0, parseRate: 0, meetsBar: false };
  let parsed = 0;
  for (const sample of list) {
    const result = parseToolCall(sample.output, sample.schema || {});
    if (result.ok) parsed += 1;
  }
  const parseRate = parsed / list.length;
  return {
    total: list.length,
    parsed,
    parseRate,
    bar: opts.bar || RELIABILITY_BAR,
    meetsBar: parseRate >= (opts.bar || RELIABILITY_BAR),
  };
}

module.exports = {
  parseToolCall,
  extractJsonCandidates,
  matchesSchema,
  reinforcePrompt,
  constrainedToolDispatch,
  routeToolChain,
  measureReliability,
  MAX_FLEET_CHAIN,
  RELIABILITY_BAR,
};
