// Agentic MCP loop driver for fleet-model development (#2854 P1-0 child of #2802; design D12). Ties the
// shipped substrate into one bounded loop: an injectable `step(ctx)` yields the fleet model's next action,
// dispatched by applyAction (fleet-agentic-actions.js) to the governed tool broker (#2847, OA2-gated) or
// the fail-closed sandbox validator (#2844). The running transcript is fed back each iteration so the
// model can react to results. SECURITY: the OPERATOR owns `testCommand` (from opts) — a fleet `propose`
// action can never choose what runs, the #2844 principle. The loop is BOUNDED and escalates on
// max-iterations / a consecutive-failure budget / an explicit fleet escalate. All side-effects
// (step/invokeTool/validate) injectable → tests are network/process-free.
const { invokeTool } = require('./fleet-mcp-broker');
const { validateProposedChange } = require('./fleet-sandbox-exec');
const { applyAction } = require('./fleet-agentic-actions');

// Resolve opts → config: injectable side-effects default to the shipped #2847/#2844 fns; bounds default.
// `??` (not `||`) so a deliberate 0 bound is respected.
function resolveConfig(opts) {
  return {
    invokeTool: opts.invokeTool ?? invokeTool,
    validate: opts.validate ?? validateProposedChange,
    root: opts.root,
    testCommand: opts.testCommand ?? ['true'],
    maxIterations: opts.maxIterations ?? 8,
    maxConsecutiveFailures: opts.maxConsecutiveFailures ?? 3,
  };
}

// runAgenticLoop(opts) -> { outcome, reason, result?, transcript, iterations }.
//   opts.step: async (ctx) => action  REQUIRED — the fleet model's next action (injectable; a real
//     integration backs it with dispatchWithContext + a model-output parser, #2823).
//   opts.testCommand: [cmd,...args] operator-owned · opts.maxIterations / maxConsecutiveFailures bounds ·
//   opts.invokeTool / validate / root injectable (default to the shipped #2847/#2844 fns).
async function runAgenticLoop(opts = {}) {
  if (typeof opts.step !== 'function') {
    throw new Error('runAgenticLoop: opts.step (ctx) => Promise<action> is required');
  }
  const cfg = resolveConfig(opts);
  const transcript = [];
  let consecutiveFailures = 0;
  for (let iteration = 0; iteration < cfg.maxIterations; iteration += 1) {
    const action = await opts.step({ task: opts.task, transcript, iteration });
    const outcome = applyAction(action, cfg, cfg.testCommand);
    transcript.push(outcome.record);
    consecutiveFailures = outcome.failed ? consecutiveFailures + 1 : 0;
    if (outcome.done) return { ...outcome.done, transcript, iterations: iteration + 1 };
    // > 0 guard: a successful action (streak reset to 0) must never trip failure-escalation, and it makes
    // maxConsecutiveFailures:0 mean "escalate on the first failure".
    if (consecutiveFailures > 0 && consecutiveFailures >= cfg.maxConsecutiveFailures) {
      return { outcome: 'escalated', reason: 'repeated-failure', transcript, iterations: iteration + 1 };
    }
  }
  return { outcome: 'escalated', reason: 'max-iterations', transcript, iterations: cfg.maxIterations };
}

module.exports = { runAgenticLoop, applyAction };
