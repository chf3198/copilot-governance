/**
 * Fleet Advisor — bounded background trigger (Epic #3414 #3483, §5).
 *
 * The entry point that runs the Advisor without ever blocking a session or spending tokens on an
 * unchanged fleet. On SessionStart (or an opt-in 6h cron) it:
 *   1. runs the Layer-① lint (deterministic, $0, sync) — always cheap;
 *   2. gates the Layer-② AI pass on a FINGERPRINT-CHANGED-OR-STALE check against a small cache, so an
 *      unchanged fleet triggers NO AI dispatch and costs ZERO tokens;
 *   3. applies kill-switches to the AI pass (single dispatch, token cap, timeout) and runs it
 *      best-effort so it never blocks.
 *
 * `FLEET_ADVISOR_DISABLED=1` is a clean no-op. lint/AI/cache IO are injected (pure + testable).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_CACHE_FILE = path.join(os.homedir(), '.megingjord', 'fleet-advisor-cache.json');
const DEFAULT_STALE_MS = 24 * 60 * 60 * 1000; // re-run the AI pass at least daily even if unchanged
// Kill-switch defaults: one dispatch, a hard token cap, and a short timeout — the AI pass is an
// accelerator, never a long-horizon agent.
const KILL_SWITCHES = { maxAiTokens: 512, aiTimeoutMs: 20000, maxAiDispatches: 1 };

/** True when the operator has opted out via env (clean no-op path). */
function isDisabled(env = process.env) {
  return env.FLEET_ADVISOR_DISABLED === '1' || env.MEGINGJORD_FLEET_DIRECT_BLOCK === '1';
}

/** Read the fingerprint cache ({ hash, ts }); a missing/corrupt cache is a cold miss, never a throw. */
function loadCache(file = DEFAULT_CACHE_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

/** Persist the fingerprint cache. Best-effort — a write failure is swallowed (never blocks). */
function saveCache(entry, file = DEFAULT_CACHE_FILE) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(entry));
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Decide whether the AI pass should run. Runs ONLY when the fleet changed (hash differs from cache)
 * or the cache is stale (older than staleMs) or cold (no cache). An unchanged + fresh fingerprint
 * returns { run:false } → zero tokens (AC1).
 */
function shouldRunAiPass(currentHash, cache, opts = {}) {
  const now = typeof opts.now === 'number' ? opts.now : 0;
  const staleMs = opts.staleMs || DEFAULT_STALE_MS;
  if (!cache || !cache.hash) return { run: true, reason: 'cold-cache' };
  if (cache.hash !== currentHash) return { run: true, reason: 'fingerprint-changed' };
  if (now > 0 && cache.ts && now - cache.ts > staleMs) return { run: true, reason: 'stale-cache' };
  return { run: false, reason: 'unchanged-fresh' };
}

/** Wrap the injected AI pass with the kill-switches (token cap + timeout + single dispatch). */
async function runAiWithKillSwitches(lintReport, opts) {
  const runAiPass = opts.runAiPass;
  if (typeof runAiPass !== 'function') return { aiRan: false, reason: 'no-ai-pass' };
  const ks = Object.assign({}, KILL_SWITCHES, opts.killSwitches);
  const timeout = new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), ks.aiTimeoutMs);
    if (timer.unref) timer.unref();
  });
  try {
    const result = await Promise.race([
      runAiPass(lintReport, { now: opts.now, maxAttempts: 1, maxTokens: ks.maxAiTokens }),
      timeout,
    ]);
    if (result && result.timedOut) return { aiRan: false, reason: 'timeout' };
    return { aiRan: true, report: result };
  } catch (err) {
    return { aiRan: false, reason: `ai-error:${err.message}` };
  }
}

/**
 * Run the trigger. Never throws, never blocks. Returns a status object:
 *   { status, tier, aiRan, aiTokensSpent, reason }. AI dispatch happens ONLY when shouldRunAiPass
 *   says so; an unchanged fingerprint yields aiRan:false + aiTokensSpent:0 (AC1). `FLEET_ADVISOR_DISABLED`
 *   short-circuits to a clean no-op (AC2).
 */
async function runTrigger(opts = {}) {
  const env = opts.env || process.env;
  if (isDisabled(env)) return { status: 'disabled', aiRan: false, aiTokensSpent: 0, reason: 'FLEET_ADVISOR_DISABLED' };

  const runLint = opts.runLint;
  if (typeof runLint !== 'function') return { status: 'no-lint', aiRan: false, aiTokensSpent: 0 };
  let lintReport;
  try {
    lintReport = runLint(opts.probe, { now: opts.now });
  } catch (err) {
    return { status: 'lint-error', aiRan: false, aiTokensSpent: 0, reason: err.message };
  }
  const hash = (lintReport.fingerprint && lintReport.fingerprint.hash) || 'unknown';
  const cache = opts.cache !== undefined ? opts.cache : loadCache(opts.cacheFile);
  const decision = shouldRunAiPass(hash, cache, opts);
  if (!decision.run) {
    return { status: 'skipped-unchanged', tier: lintReport.tier, aiRan: false, aiTokensSpent: 0, reason: decision.reason };
  }
  const ai = await runAiWithKillSwitches(lintReport, opts);
  if (opts.cache === undefined) saveCache({ hash, ts: opts.now || 0 }, opts.cacheFile);
  return {
    status: 'ran',
    tier: lintReport.tier,
    aiRan: ai.aiRan,
    aiTokensSpent: ai.aiRan ? (ai.report && ai.report.aiPass && ai.report.aiPass.aiFindingCount ? KILL_SWITCHES.maxAiTokens : 0) : 0,
    reason: decision.reason,
    report: ai.report || lintReport,
  };
}

module.exports = {
  runTrigger,
  shouldRunAiPass,
  runAiWithKillSwitches,
  isDisabled,
  loadCache,
  saveCache,
  KILL_SWITCHES,
  DEFAULT_STALE_MS,
  DEFAULT_CACHE_FILE,
};
