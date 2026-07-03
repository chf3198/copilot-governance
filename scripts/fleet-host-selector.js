/**
 * Fleet Advisor — F3 least-loaded host selector (Epic #3414 #3486, §Q3).
 *
 * On a multi-host mesh (F3) pick the least-loaded WARM host so dispatch spreads across capacity
 * instead of hammering one box. Load is scored from a read-only `/api/ps` probe: fewer resident
 * models + more free VRAM = less loaded. Degrade-safe: an unreachable peer is simply skipped (drop to
 * the single reachable host = F2); if every host is down we return null so the caller falls to the
 * free-cloud third tier. Pure + never throws — the probe is injected (real probing lives in #3483).
 */
'use strict';

// Free-VRAM tie-breaker normalizer (MB): keeps the VRAM term in [0,1) so it never flips the
// primary resident-count ordering.
const VRAM_TIEBREAK_NORMALIZER_MB = 100000;

/** Score a host's load: lower is better. Unreachable → Infinity (never selected). */
function loadScore(host) {
  if (!host || !host.reachable) return Infinity;
  const resident = Array.isArray(host.ps) ? host.ps.length : 0;
  const freeVramMb = (host.gpu && Number(host.gpu.vramFreeMb)) || 0;
  // Primary key: resident model count (each resident model is memory + scheduling pressure).
  // Tie-break: prefer more free VRAM (subtract a small normalized term so it never flips the primary).
  return resident - Math.min(0.99, freeVramMb / VRAM_TIEBREAK_NORMALIZER_MB);
}

/**
 * Select the least-loaded reachable host. Returns the host object, or null when none is reachable
 * (caller degrades to free-cloud). Ties break deterministically by host id for reproducibility.
 */
function selectLeastLoaded(hosts) {
  const reachable = (Array.isArray(hosts) ? hosts : []).filter((h) => h && h.reachable);
  if (reachable.length === 0) return null;
  return reachable
    .slice()
    .sort((a, b) => {
      const scoreDelta = loadScore(a) - loadScore(b);
      if (scoreDelta !== 0) return scoreDelta;
      return String(a.id || '').localeCompare(String(b.id || ''));
    })[0];
}

/**
 * Resolve the dispatch posture for a mesh: { tier, host, peersDown }. F3 when ≥2 reachable, F2 when
 * exactly one, F0 (host null → free-cloud) when none. Never throws.
 */
function resolveHostPosture(hosts) {
  const list = Array.isArray(hosts) ? hosts : [];
  const reachable = list.filter((h) => h && h.reachable);
  const peersDown = list.filter((h) => h && h.reachable === false).map((h) => h.id || h.url || 'unknown');
  const host = selectLeastLoaded(list);
  let tier = 'F0';
  if (reachable.length >= 2) tier = 'F3';
  else if (reachable.length === 1) tier = 'F2';
  return { tier, host, peersDown, reachableCount: reachable.length };
}

module.exports = { selectLeastLoaded, resolveHostPosture, loadScore };
