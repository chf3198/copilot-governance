'use strict';
// tier: 3
// Progress observability for slow fleet dispatches (#2842 / Epic #2926 C2).
// (Library only — no CLI entrypoint, so no shebang; per cross-family review #2842.)
// Generalizes the #2901 `.unref()` 30s-heartbeat pattern: emit a tier-start line plus a
// periodic heartbeat to stderr so the operator SEES the free fleet working during the
// multi-minute (now up to 1500s/1800s per #2937) inference, instead of a dark terminal that
// pushes them to a paid call. stderr-only — stdout stays clean for the answer / `--json`.
// G3 (zero-cost fleet) >> G7 (speed): patience is tolerable only when progress is visible.

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Run `fn` while emitting start + periodic heartbeat progress lines.
 * @param {string} label - short work label, e.g. "fleet inference (qwen2.5:7b)".
 * @param {() => Promise<any>} fn - the slow async operation to await.
 * @param {object} [opts]
 * @param {number} [opts.intervalMs] - heartbeat cadence (default 30s).
 * @param {number} [opts.patienceMs] - optional total patience budget, shown as "/ Ns patience".
 * @param {(line: string) => void} [opts.write] - sink (default process.stderr.write); injectable for tests.
 * @param {() => number} [opts.now] - clock (default Date.now); injectable for tests.
 * @returns {Promise<any>} resolves/rejects exactly as `fn` does; timer always cleared.
 */
function withProgress(label, fn, opts = {}) {
  const intervalMs = opts.intervalMs || DEFAULT_INTERVAL_MS;
  const write = opts.write || ((line) => process.stderr.write(line));
  const clock = opts.now || Date.now;
  const patienceSec = opts.patienceMs ? Math.round(opts.patienceMs / 1000) : null;
  const start = clock();
  write(`[cascade] ${label} — starting (heartbeat every ${Math.round(intervalMs / 1000)}s)\n`);
  const timer = setInterval(() => {
    const elapsedSec = Math.round((clock() - start) / 1000);
    const cap = patienceSec ? ` / ${patienceSec}s patience` : '';
    write(`[cascade] ${label} — still working (${elapsedSec}s${cap})...\n`);
  }, intervalMs);
  // A progress timer must never hold the event loop open (the #2901 invariant).
  if (typeof timer.unref === 'function') timer.unref();
  // Deliberate: the Promise.resolve().then() wrapper routes a SYNCHRONOUS throw from fn()
  // through .finally too — `fn().finally()` would leak the timer if fn threw before returning.
  return Promise.resolve()
    .then(() => fn())
    .finally(() => clearInterval(timer));
}

module.exports = { withProgress, DEFAULT_INTERVAL_MS };
