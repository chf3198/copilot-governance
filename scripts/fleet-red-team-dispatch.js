#!/usr/bin/env node
// tier: 3
// fleet-red-team-dispatch — HAMR-wrapped Ollama dispatcher for adversarial review.
// Refs #2175 (Phase-1 P1-1 of Epic #2041). Consumes templates from #2181 P1-3.
// Uses tier='fleet-local' (per #2178 P1-7) so cache-stats records ollama provider correctly.
// selectModel() added by #2317 (Phase-1 P1.1 of Epic #2299): reads matrix at dispatch time.

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { wrapProviderCall } = require('./hamr-provider-wrapper');
const { residentModels } = require('./fleet-resident');
const { dispatchGet } = require('./fleet-probe');

const DEFAULT_HOST = 'http://100.91.113.16:11434';
// #3167: routine reviews default to the fast 7b; 32b is high-stakes opt-in only.
const DEFAULT_MODEL = 'qwen2.5-coder:7b';
const TIER = 'fleet-local';
const RETRY_DELAYS_MS = [1000, 4000];
const DEFAULT_TIMEOUT_POLICY = path.join(__dirname, '..', '..', 'config', 'timeout-policy.json');
// G3 patience: read the fleet-red-team-rate class (Phase-0 #2174: qwen2.5-coder:32b p99=907s) so slow
// Tailscale models are waited on; fall back to the prior 600s on a missing/malformed policy. Path-injectable.
function loadFleetTimeout(policyPath = DEFAULT_TIMEOUT_POLICY, fallbackMs = 600_000) {
  try {
    const classes = JSON.parse(fs.readFileSync(policyPath, 'utf8')).classes;
    const ms = classes && classes['fleet-red-team-rate'] && classes['fleet-red-team-rate'].ms;
    return typeof ms === 'number' && ms > 0 ? ms : fallbackMs;
  } catch { return fallbackMs; }
}
const REQUEST_TIMEOUT_MS = loadFleetTimeout();
const DEFAULT_KEEP_ALIVE = '30m';
// #3333 (G6): bounded reachability gate. A dead/unreachable fleet host must fail
// over to the $0 free-cloud tier within this probe window — never block on the long
// generation patience (REQUEST_TIMEOUT_MS up to 1500s x retries), the multi-minute
// preflight hang observed during #3331. Env-tunable; reuses the fleet-probe primitive.
const FLEET_PROBE_TIMEOUT_MS = Number(process.env.FLEET_PROBE_TIMEOUT_MS) || 8000;

// Strip the URL scheme so fleet-probe's host:port parser sees "host:port".
function hostPort(host) { return String(host).replace(/^https?:\/\//, '').replace(/\/$/, ''); }

// Bounded fleet reachability check (GET /api/version). True only on a real, parseable
// response within FLEET_PROBE_TIMEOUT_MS; any network error/timeout returns false.
async function fleetReachable(host, deps = {}) {
  const get = deps.dispatchGet || dispatchGet;
  try {
    const res = await get({ host: hostPort(host), path: '/api/version', timeoutMs: FLEET_PROBE_TIMEOUT_MS });
    return !!(res && res.ok === true);
  } catch { return false; }
}
const TEMPLATES_PATH = path.join(__dirname, '..', '..', 'config', 'fleet-red-team-prompts.json');
const MATRIX_PATH = path.join(__dirname, '..', '..', 'config', 'red-team-model-matrix.yml');
const TOKEN_BUDGET_HEADROOM = 200;
const MAX_NUM_PREDICT = 2000;
const REFUSAL_PATTERNS = [/^i cannot help with/i, /^i'm sorry, but i cannot/i, /^i am unable to/i];
const ARXIV_HALLUCINATION_RE = /arxiv\.org\/abs\/[0-9]{4}\.[0-9]{4,5}/gi;

// Minimal inline YAML parser for the model matrix (no external dep required).
function loadMatrix(matrixPath = MATRIX_PATH) {
  const raw = fs.readFileSync(matrixPath, 'utf8');
  const models = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    const mId = line.match(/^  - id:\s*"([^"]+)"/);
    if (mId) { if (cur) models.push(cur); cur = { id: mId[1] }; continue; }
    if (!cur) continue;
    const mB = line.match(/^\s+blocked:\s*(true|false)/);
    if (mB) { cur.blocked = mB[1] === 'true'; continue; }
    const mCF = line.match(/^\s+cross_family_ok:\s*(true|false)/);
    if (mCF) { cur.cross_family_ok = mCF[1] === 'true'; continue; }
    const mAv = line.match(/^\s+availability:\s*"([^"]+)"/);
    if (mAv) { cur.availability = mAv[1]; continue; }
    const mSt = line.match(/^\s+default_for_stakes:\s*\[([^\]]+)\]/);
    if (mSt) { cur.default_for_stakes = mSt[1].split(',').map((s) => s.trim().replace(/"/g, '')); }
  }
  if (cur) models.push(cur);
  const mFB = raw.match(/fallback_chain:\s*\[([^\]]+)\]/);
  const fallbackChain = mFB ? mFB[1].split(',').map((s) => s.trim().replace(/"/g, '')) : [DEFAULT_MODEL];
  return { models, fallbackChain };
}

/**
 * selectModel(taskContext, opts) — A1 selection function per red-team-model-matrix.yml.
 * taskContext: { stakes?: 'high'|'medium'|'low' }
 * opts: { model?: string, matrixPath?: string }
 * Returns: { modelId: string, rationale: string, warning?: string }
 */
function selectModel(taskContext = {}, opts = {}) {
  if (opts.model) return { modelId: opts.model, rationale: 'caller-override' };
  const { models, fallbackChain } = loadMatrix(opts.matrixPath);
  const stakes = (taskContext.stakes || 'low').toLowerCase();
  const candidates = models.filter((m) => !m.blocked && m.cross_family_ok !== false);
  // #2599 (G3): for non-high stakes, prefer an already-resident cross-family
  // model so the review stays on the free fleet instead of cold-loading and
  // falling back to a paid cloud reviewer. High stakes keeps the best model.
  if (stakes !== 'high' && Array.isArray(opts.residentModels) && opts.residentModels.length) {
    const resident = candidates.find((m) => opts.residentModels.includes(m.id));
    if (resident) return { modelId: resident.id, rationale: `resident-preferred-${stakes}` };
  }
  const match = candidates.find(
    (m) => Array.isArray(m.default_for_stakes) && m.default_for_stakes.includes(stakes),
  );
  if (match) {
    const warning = match.availability === 'conditional'
      ? `model ${match.id} is conditional-availability — verify fleet host before dispatch`
      : undefined;
    return { modelId: match.id, rationale: `matrix-stakes-${stakes}`, warning };
  }
  for (const fbId of fallbackChain) {
    const fb = candidates.find((m) => m.id === fbId);
    if (fb) return { modelId: fb.id, rationale: 'fallback-chain' };
  }
  return { modelId: DEFAULT_MODEL, rationale: 'hardcoded-default' };
}

function loadTemplate(artifactType, templatesPath = TEMPLATES_PATH) {
  const obj = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
  const tmpl = obj.templates[artifactType];
  if (!tmpl) throw new Error(`unknown artifact-type: ${artifactType}`);
  return tmpl;
}

function buildPrompt(template, content) {
  return template.prompt_template.replace('{{content}}', content);
}

function stripArxivHallucinations(text) {
  return String(text).replace(ARXIV_HALLUCINATION_RE, '[arxiv-ref-stripped]');
}

function detectRefusal(text) {
  const trimmed = String(text).trim();
  return REFUSAL_PATTERNS.some((re) => re.test(trimmed));
}

function resolveKeepAlive(raw = process.env.FLEET_KEEP_ALIVE) {
  const value = String(raw || '').trim();
  if (/^\d+[smhd]$/i.test(value)) return value.toLowerCase();
  return DEFAULT_KEEP_ALIVE;
}

// Backward-compatible alias used by existing callers/tests.
function keepAliveValue() { return resolveKeepAlive(); }

// Heartbeat interval (ms): emit progress so operator knows fleet is working (G3 patience).
const HEARTBEAT_INTERVAL_MS = 30_000;

async function callOllamaOnce({ host, model, prompt, num_predict }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Keep model warm between baton reviews to reduce cold-load paid fallbacks.
  const keepAlive = resolveKeepAlive();
  // Emit progress every 30s — keeps operator terminal active during slow Tailscale generations.
  const patienceSec = Math.round(REQUEST_TIMEOUT_MS / 1000);
  let heartbeatCount = 0;
  const heartbeat = setInterval(() => {
    heartbeatCount += 1;
    process.stderr.write(`[fleet-dispatch] waiting on ${model} at ${host} (${heartbeatCount * HEARTBEAT_INTERVAL_MS / 1000}s / ${patienceSec}s patience)...\n`);
  }, HEARTBEAT_INTERVAL_MS);
  if (typeof heartbeat.unref === 'function') heartbeat.unref(); // a progress timer must never hold the loop open
  try {
    const response = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        keep_alive: keepAlive,
        options: { temperature: 0.3, num_predict },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); clearInterval(heartbeat); }
}

async function callWithRetry({ host, model, prompt, num_predict }) {
  const attempts = RETRY_DELAYS_MS.length + 1;
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { return await callOllamaOnce({ host, model, prompt, num_predict }); }
    catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw lastErr;
}

function parseFindings(raw) {
  const text = (raw && raw.response) || '';
  if (!text || text.length < 50) return { findings: [], warning: 'empty-or-short-response' };
  if (detectRefusal(text)) return { findings: [], warning: 'fleet-refused' };
  const cleaned = stripArxivHallucinations(text);
  const lines = cleaned.split('\n').filter((l) => /^\s*(?:[-*]\s*)?\*?\*?(ACCEPT|REJECT|PARTIAL)/i.test(l));
  return { findings: lines.map((line) => ({ raw: line.trim() })), warning: null };
}

async function dispatchRedTeam({
  artifactType, content, model, host = DEFAULT_HOST,
  templatesPath = TEMPLATES_PATH, taskContext = {}, matrixPath, deps = {},
} = {}) {
  const wrap = deps.wrapProviderCall || wrapProviderCall;
  // AC2 (#2283): load template first so per-artifact stakes can inform model selection.
  // Precedence: caller model > caller stakes > template.stakes > 'medium' (AC3 back-compat).
  const template = loadTemplate(artifactType, templatesPath);
  const templateStakes = template.stakes || 'medium';
  const VALID_STAKES = new Set(['high', 'medium', 'low']);
  const rawStakes = taskContext.stakes || templateStakes;
  // AC3: normalize invalid or missing stakes to 'medium' rather than letting a
  // bad value silently fall through to the fallback chain (AC5d edge-case safety).
  const effectiveStakes = VALID_STAKES.has(rawStakes) ? rawStakes : 'medium';
  const stakesSource = taskContext.stakes ? 'caller-stakes' : `template-stakes-${templateStakes}`;
  // #2599 (G3): tell selectModel which models are already resident on the host
  // so non-high-stakes reviews prefer the free-fleet resident over a cold-load.
  const resident = model ? [] : await residentModels(host);
  const resolved = model
    ? { modelId: model, rationale: 'caller-arg' }
    : selectModel({ ...taskContext, stakes: effectiveStakes }, { matrixPath, residentModels: resident });
  const activeModel = resolved.modelId;
  const prompt = buildPrompt(template, content);
  const numPredict = Math.min(template.expected_token_range[1] + TOKEN_BUDGET_HEADROOM, MAX_NUM_PREDICT);
  // #3333: gate the long generate behind a bounded reachability probe so an
  // unreachable fleet host fails over to the $0 free-cloud tier in seconds, not the
  // multi-minute generation patience window. Fail-over reuses onFleetUnavailable.
  const reachable = await fleetReachable(host, { dispatchGet: deps.dispatchGet });
  if (!reachable) {
    const { onFleetUnavailable } = require('./review-dispatch-failover');
    return onFleetUnavailable({ prompt, parseFindings, deps: deps.freeCloud,
      fallbackModel: activeModel, elapsed: 0, error: 'fleet-unreachable-probe' });
  }
  const start = Date.now();
  const envelope = await wrap(
    'ollama',
    () => callWithRetry({ host, model: activeModel, prompt, num_predict: numPredict }),
    { tier: TIER },
  );
  const elapsed = Date.now() - start;
  if (!envelope.ok) {
    // #2646 (G3): fleet AVAILABILITY failure → fail over to the $0 free-cloud tier
    // rather than return empty (which forces a review-skip or a paid escalation).
    const { onFleetUnavailable } = require('./review-dispatch-failover');
    return onFleetUnavailable({ prompt, parseFindings, deps: deps.freeCloud,
      fallbackModel: activeModel, elapsed, error: envelope.meta?.error ?? envelope.error });
  }
  const { findings, warning } = parseFindings(envelope.value);
  // #3167: expose the response TEXT so consumers stop calling .match/.slice on
  // `raw` (the Ollama response object) — the raw.slice-is-not-a-function crash.
  const text = (envelope.value && envelope.value.response) || '';
  return { findings, raw: envelope.value, text, modelUsed: activeModel,
    hamrStats: { ok: true, elapsed, sticky: envelope.sticky, warning,
      modelRationale: resolved.rationale,
      stakesSource } };
}

// LIBRARY ONLY (no CLI). Direct CLI invocation redirects to the canonical dispatcher cascade-dispatch.js
// (#2858 / Epic #2926 D1) and exits non-zero — it previously exited SILENTLY, stranding the operator into a
// raw paid call (the root cause of review bypassing the $0 lanes). The review entrypoint is cascade-dispatch.
if (require.main === module) {
  process.stderr.write('fleet-red-team-dispatch.js is a LIBRARY, not a CLI.\n'
    + 'Canonical review dispatcher: node scripts/global/cascade-dispatch.js --prompt "..." --model qwen2.5-coder:32b\n');
  process.exit(2);
}

module.exports = {
  dispatchRedTeam, selectModel, loadMatrix, loadTemplate, buildPrompt,
  callWithRetry, parseFindings, stripArxivHallucinations, detectRefusal,
  callWithRetry, callOllamaOnce, keepAliveValue, parseFindings,
  stripArxivHallucinations, detectRefusal,
  resolveKeepAlive, loadFleetTimeout,
  fleetReachable, hostPort,
  TIER, RETRY_DELAYS_MS, MATRIX_PATH, REQUEST_TIMEOUT_MS, FLEET_PROBE_TIMEOUT_MS,
};
