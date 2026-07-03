'use strict';
// tier: 3
// Probe-first fleet backend selection (#2929 / Epic #2926 C3).
// The LiteLLM gateway path has a 120s hard-timeout; when the gateway is DOWN or slow-to-health,
// a naive "try litellm, catch, then ollama" makes the operator eat that full 120s before the
// fallback. Here we run the fast (~5s) health probe FIRST and route straight to direct Ollama
// when LiteLLM is unhealthy — no 120s hang — and make the (previously silent) switch observable
// on stderr + telemetry. Library only: all I/O is injected so the decision logic is pure-testable.
// G6 resilience (graceful gateway-down fallback) + G8 observability (the switch is visible).

/**
 * Pure decision: given a healthCheck() result, pick the fleet backend.
 * @param {{ok?: boolean, backend?: string}|null} health
 * @returns {{backend: 'litellm'|'ollama', fallback_reason?: string}}
 */
function selectFleetBackend(health) {
  if (health && health.ok && health.backend === 'litellm') return { backend: 'litellm' };
  const reason = !health || !health.ok ? 'probe-failed' : 'gateway-unhealthy';
  return { backend: 'ollama', fallback_reason: reason };
}

/**
 * Probe-first dispatch. All side effects are injected via `deps` for testability:
 *   deps.healthCheck() -> { ok, backend }       deps.litellmChat(p,o) / deps.ollamaChat(p,o) -> { ok, content, ... }
 *   deps.write(line)   -> stderr sink           deps.record(event) -> telemetry sink
 * Routes to LiteLLM only when the probe says it is healthy; otherwise (or on a LiteLLM
 * call failure) emits the fallback line and serves from direct Ollama.
 */
async function dispatchFleet(prompt, opts = {}, deps = {}) {
  const health = await deps.healthCheck();
  const choice = selectFleetBackend(health);
  if (choice.backend === 'litellm') {
    // A throwing gateway client must still fall back, not crash the dispatch (G6 resilience).
    let served = null;
    try { served = await deps.litellmChat(prompt, opts); }
    catch (e) { served = { ok: false, error: (e && e.message) || 'litellm-threw' }; }
    if (served && served.ok) {
      if (deps.record) deps.record({ backend: 'litellm', fallback: false });
      return { ...served, backend: 'litellm' };
    }
    // Probe passed but the call failed (transient/capability) — fall back to Ollama too.
    choice.fallback_reason = (served && served.error) || 'litellm-call-failed';
  }
  const reason = choice.fallback_reason || 'gateway-unhealthy';
  if (deps.write) deps.write(`[fleet] litellm ${reason} → direct Ollama fallback\n`);
  const served = await deps.ollamaChat(prompt, opts);
  if (deps.record) deps.record({ backend: 'ollama', fallback: true, fallback_reason: reason });
  return { ...served, backend: 'ollama', fallback_reason: reason };
}

module.exports = { selectFleetBackend, dispatchFleet };
