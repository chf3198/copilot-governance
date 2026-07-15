/**
 * Fleet Advisor — warm-on-session-start entry point (Epic #3414 #3484, AC1).
 *
 * Makes the hot 7B resident with a keep_alive ping so the first real dispatch is not a cold load.
 * Best-effort + non-blocking: a warm failure (fleet down) is logged, never thrown — the session
 * proceeds. Invoked by #3483's SessionStart/background trigger, or directly:
 *   node scripts/global/fleet-warm-pool.js
 */
'use strict';

const { warmHotModels, HOT_KEEP_ALIVE } = require('./fleet-stakes-router');
const { chatComplete } = require('./ollama-direct');

/**
 * Warm the hot models by sending a tiny keep_alive ping to each. `deps.chat` is injectable for tests;
 * the default sends a 1-token ollama request that pins the model resident for HOT_KEEP_ALIVE.
 */
async function warmPool(opts = {}, deps = {}) {
  const chat = deps.chat || chatComplete;
  const ping = (model, o) => chat('warm', { model, maxTokens: 1, keepAlive: o.keepAlive || HOT_KEEP_ALIVE });
  return warmHotModels(opts, ping);
}

async function main() {
  const result = await warmPool();
  const summary = `warmed=${result.warmed.join(',') || 'none'} failed=${result.failed.length}`;
  process.stderr.write(`[fleet-warm-pool] ${summary}\n`);
  process.stdout.write(JSON.stringify(result));
}

if (require.main === module) {
  main().catch((err) => { process.stderr.write(`[fleet-warm-pool] ${err.message}\n`); });
}

module.exports = { warmPool };
