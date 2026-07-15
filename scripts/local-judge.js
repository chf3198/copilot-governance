#!/usr/bin/env node
'use strict';
// tier: 3
// Layer 2 judge gate — semantic quality assessment using an independent local model.
// Uses phi3:mini (Phi-3 family, architecturally independent from qwen2.5 generator).

const { chatComplete } = require('./ollama-direct');

const JUDGE_MODEL = process.env.JUDGE_MODEL || 'phi3:mini';
const DEFAULT_THRESHOLD = 0.7;

const RUBRIC = `You are a quality judge for AI responses. Score the response 0.0–1.0.
Scoring guide: 1.0=complete and accurate; 0.7=adequate; 0.5=partial; 0.3=poor; 0.0=wrong/incoherent.
Respond ONLY with JSON: {"score": 0.X, "reason": "one sentence"}

Task: {TASK}
Response: {RESPONSE}`;

function buildPrompt(task, response) {
  return RUBRIC
    .replace('{TASK}', task.slice(0, 400))
    .replace('{RESPONSE}', response.slice(0, 600));
}

function parseScore(content) {
  const m = content.match(/\{[^}]*"score"\s*:\s*([\d.]+)[^}]*\}/);
  if (!m) return null;
  const s = parseFloat(m[1]);
  return isNaN(s) ? null : Math.max(0, Math.min(1, s));
}

async function judgeResponse(task, response, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const start = Date.now();
  const result = await chatComplete(buildPrompt(task, response), {
    model: opts.judgeModel || JUDGE_MODEL,
    maxTokens: 80,
  });
  const latency_ms = Date.now() - start;
  if (!result.ok) return { ok: false, error: result.error, latency_ms };

  const judge_score = parseScore(result.content);
  if (judge_score === null)
    return { ok: false, error: 'unparseable_score', raw: result.content.slice(0, 80), latency_ms };

  const decision = judge_score >= threshold ? 'return' : 'escalate';
  const rm = result.content.match(/"reason"\s*:\s*"([^"]+)"/);
  return {
    ok: true,
    judge_model: opts.judgeModel || JUDGE_MODEL,
    judge_score,
    decision,
    reason: rm?.[1] || '',
    latency_ms,
  };
}

module.exports = { judgeResponse, JUDGE_MODEL, DEFAULT_THRESHOLD };
