/**
 * Fleet Advisor — keep-warm pool + deterministic stakes-based routing (Epic #3414 #3484, §Q1/Q2).
 *
 * The F2 worked example from the Phase-0 design: on a one-GPU host a 7B fits GPU-resident (fast) while
 * a 32B runs CPU-offloaded (slow, >10-min cold load). So route the COMMON path to the resident 7B and
 * reserve the 32B for genuine high-stakes work — and keep the 7B WARM so the first dispatch isn't a
 * cold load. This module is the deterministic decision layer (pure + testable); cascade-dispatch wires
 * it to the live dispatch and threads the chosen `keep_alive` through.
 *
 * Composition with per_role_lane_preferences (#2320): the lane preference chooses free/fleet/haiku/
 * premium; this gate only decides 7B-vs-32B *within* the fleet lane — it never overrides the lane.
 */
'use strict';

// A prompt is high-stakes when it needs multi-hop reasoning / carries real blast radius. These are the
// same classes the router policy sends direct-to-premium; here they pick the 32B over the 7B.
const HIGH_STAKES_MARKERS = /\b(security|vulnerab|exploit|threat|architect|incident|proof|concurren|migrat|cross-system|deadlock|race[ -]condition)/i;
const HIGH_STAKES_ROLES = new Set(['manager', 'consultant']);

const DEFAULT_HOT_MODEL = 'qwen2.5-coder:7b';
const DEFAULT_HIGH_STAKES_MODEL = 'qwen2.5-coder:32b';
// keep_alive: the hot 7B stays pinned resident (no cold load on the common path); the 32B loads
// on-demand with a SHORT ttl so it evicts quickly and frees VRAM for the resident 7B.
const HOT_KEEP_ALIVE = '30m';
const HIGH_STAKES_KEEP_ALIVE = '5m';

/**
 * Classify a request as 'high' or 'routine' stakes. Deterministic precedence:
 * explicit override → baton role → content markers → default routine.
 */
function classifyStakes(prompt, opts = {}) {
  if (opts.stakes === 'high' || opts.stakes === 'routine') return opts.stakes;
  if (opts.role && HIGH_STAKES_ROLES.has(String(opts.role).toLowerCase())) return 'high';
  if (typeof prompt === 'string' && HIGH_STAKES_MARKERS.test(prompt)) return 'high';
  return 'routine';
}

/** Resolve the hot (7B) and high-stakes (32B) model names from opts/policy or the defaults. */
function resolveRoster(opts = {}) {
  return {
    hot: opts.hotModel || DEFAULT_HOT_MODEL,
    highStakes: opts.highStakesModel || DEFAULT_HIGH_STAKES_MODEL,
  };
}

/** The keep_alive string for a chosen stakes level. */
function keepAliveFor(stakes) {
  return stakes === 'high' ? HIGH_STAKES_KEEP_ALIVE : HOT_KEEP_ALIVE;
}

/**
 * The full deterministic fleet route for a prompt: { stakes, model, keepAlive }. Given the same prompt
 * + opts it always yields the same decision (AC2). `hotPath` is true for the resident-7B common path.
 */
function resolveFleetRoute(prompt, opts = {}) {
  const stakes = classifyStakes(prompt, opts);
  const roster = resolveRoster(opts);
  const model = stakes === 'high' ? roster.highStakes : roster.hot;
  return { stakes, model, keepAlive: keepAliveFor(stakes), hotPath: stakes === 'routine' };
}

/**
 * Warm-on-session-start: make the hot 7B resident so the first real dispatch is not a cold load (AC1).
 * `dispatchFn(model, { keepAlive, warm })` is injected (a tiny keep_alive ping); best-effort and
 * non-blocking — a warm failure is reported, never thrown. Returns { warmed, failed, skipped }.
 */
async function warmHotModels(opts = {}, dispatchFn) {
  const roster = resolveRoster(opts);
  const models = opts.warmModels || [roster.hot];
  if (typeof dispatchFn !== 'function') return { warmed: [], failed: [], skipped: models };
  const warmed = [];
  const failed = [];
  for (const model of models) {
    try {
      await dispatchFn(model, { keepAlive: HOT_KEEP_ALIVE, warm: true });
      warmed.push(model);
    } catch (err) {
      failed.push({ model, reason: err.message });
    }
  }
  return { warmed, failed, skipped: [] };
}

module.exports = {
  classifyStakes,
  resolveFleetRoute,
  resolveRoster,
  keepAliveFor,
  warmHotModels,
  HIGH_STAKES_MARKERS,
  DEFAULT_HOT_MODEL,
  DEFAULT_HIGH_STAKES_MODEL,
  HOT_KEEP_ALIVE,
  HIGH_STAKES_KEEP_ALIVE,
};
