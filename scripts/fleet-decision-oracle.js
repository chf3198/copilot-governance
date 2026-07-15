// tier: 3
// fleet-decision-oracle.js — route routine dev decisions to fleet rater (#2509)
// Wraps qwen-7b (fast) and qwen-32b (high-stakes) on Tailscale fleet for
// operator-internal yes/no decisions; client-escalation only on inconclusive.
'use strict';

const http = require('node:http');

const DEFAULT_HOST = process.env.HAMR_FLEET_HOST || '100.91.113.16:11434';
const FAST_MODEL = 'qwen2.5-coder:7b';
const SLOW_MODEL = 'qwen2.5-coder:32b';
const FAST_TIMEOUT_MS = 60_000;
const SLOW_TIMEOUT_MS = 600_000;
const SLOW_MODEL_LENGTH_THRESHOLD = 1500;
const RATIONALE_SHORT_LEN = 200;
const RATIONALE_FULL_LEN = 500;
const DEFAULT_OLLAMA_PORT = 11434;

const VERDICT_RE = /\b(yes|no|partial|approve|reject|revise)\b/i;

function pickModel(opts) {
  if (opts && opts.tier === 'high-stakes') return SLOW_MODEL;
  if (opts && opts.tier === 'fast') return FAST_MODEL;
  // Default by question length: longer → high-stakes
  const len = (opts && opts.question && opts.question.length) || 0;
  return len > SLOW_MODEL_LENGTH_THRESHOLD ? SLOW_MODEL : FAST_MODEL;
}

function timeoutFor(model) {
  return model === SLOW_MODEL ? SLOW_TIMEOUT_MS : FAST_TIMEOUT_MS;
}

function parseVerdict(text) {
  if (!text) return { verdict: 'inconclusive', rationale: 'empty response' };
  const match = text.match(VERDICT_RE);
  if (!match) return { verdict: 'inconclusive', rationale: text.slice(0, RATIONALE_SHORT_LEN) };
  const word = match[1].toLowerCase();
  const normalized = (word === 'yes' || word === 'approve') ? 'approve'
    : (word === 'no' || word === 'reject') ? 'reject'
    : (word === 'partial' || word === 'revise') ? 'partial'
    : 'inconclusive';
  return { verdict: normalized, rationale: text.slice(0, RATIONALE_FULL_LEN) };
}

function dispatchOllama({ host, model, prompt, timeoutMs, httpImpl = http }) {
  return new Promise((resolve) => {
    const [hostname, portStr] = host.split(':');
    const body = JSON.stringify({ model, prompt, stream: false });
    const req = httpImpl.request({
      hostname, port: parseInt(portStr, 10) || DEFAULT_OLLAMA_PORT,
      path: '/api/generate', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ ok: true, response: JSON.parse(data).response || '' }); }
        catch (err) { resolve({ ok: false, error: 'parse_error', detail: err.message }); }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: 'network_error', detail: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function decideOnce(question, opts = {}) {
  const model = pickModel({ ...opts, question });
  const host = (opts && opts.host) || DEFAULT_HOST;
  const httpImpl = (opts && opts.httpImpl) || http;
  // Epic #3391 (Option B): the autonomy line below keeps routine reversible decisions off the client.
  const prompt = `You are an operator-internal decision oracle. Answer with one word (yes/no/partial) then a one-line rationale.

Operator-autonomy dimension (always-on principle): this question is being routed to YOU precisely so a routine reversible dev decision is NOT escalated to the human. Resolve it autonomously; only design/UAT/irreversible/security-weakening decisions belong with the client, and those are not routed here.

QUESTION: ${question}

Respond format:
VERDICT: <yes|no|partial>
RATIONALE: <one line>`;
  const result = await dispatchOllama({
    host, model, prompt, timeoutMs: timeoutFor(model), httpImpl,
  });
  if (!result.ok) {
    return { verdict: 'inconclusive', rationale: `fleet ${result.error}`, model_used: model, escalate_to_client: true };
  }
  const parsed = parseVerdict(result.response);
  return {
    verdict: parsed.verdict,
    rationale: parsed.rationale,
    model_used: model,
    escalate_to_client: parsed.verdict === 'inconclusive',
  };
}

module.exports = {
  decideOnce, parseVerdict, pickModel, timeoutFor, dispatchOllama,
  FAST_MODEL, SLOW_MODEL, DEFAULT_HOST,
};

// #2527 migration: thin wrapper that consults the router + probe for host/model
// instead of hardcoded DEFAULT_HOST + FAST_MODEL. Backward-compat: existing
// decideOnce(question, opts) unchanged; new decideOnceViaRouter(question, opts)
// added.
async function decideOnceViaRouter(question, opts = {}) {
  let router, probe;
  try {
    router = require('./fleet-router');
    probe = require('./fleet-probe');
  } catch {
    return decideOnce(question, opts);  // graceful: router not present
  }
  const route = await router.routeForTask(opts.task_class || 'decision', {
    max_tier: opts.max_tier,
    current_load_map: opts.current_load_map,
  });
  if (!route) return decideOnce(question, opts);  // no candidate, fall back
  const probed = await probe.probeHostModel(route.host, route.model, { httpImpl: opts.httpImpl });
  if (probed.decision === 'UNAVAILABLE' || probed.decision === 'ROUTE_ELSEWHERE') {
    for (const fallback of (route.fallback_chain || [])) {
      const altProbed = await probe.probeHostModel(fallback.host, fallback.model, { httpImpl: opts.httpImpl });
      if (altProbed.decision === 'AVAILABLE' || altProbed.decision === 'WAIT') {
        return decideOnce(question, { ...opts, host: fallback.host, tier: 'fast' });
      }
    }
    return { verdict: 'inconclusive', rationale: 'all fleet candidates UNAVAILABLE',
             model_used: 'none', escalate_to_client: true };
  }
  return decideOnce(question, { ...opts, host: route.host, tier: 'fast' });
}

module.exports.decideOnceViaRouter = decideOnceViaRouter;
