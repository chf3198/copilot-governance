// tier: 3
// Fleet-dev observability + NET cost-of-quality (#2800 P1-7 of Epic #2791; design D7). Aggregates the
// telemetry surfaces (routing lanes, #2795 escalations, #2796 demotions) into fleet-development-share,
// escalation-rate, and the NET cost-of-quality: gross generation saving (fleet-accepted tasks that avoided
// the next paid tier) MINUS verification overhead (cross-family critic/judge/mutation) — the NET G3 gain,
// not gross — plus a human-audit summary. Mirrors free-cloud-usage-report.js; readers injectable.
const fs = require('fs');
const path = require('path');

const ASSUMED_TOKENS_PER_CALL = 1500; // ~1k in + 0.5k out (same documented estimate as the free-cloud report)
const DEFAULT_HAIKU_COST_PER_1K = 0.00088; // counterfactual: fleet-eligible work would run on haiku (next tier)
// Amortized cross-family-critic (#2797) cost per fleet attempt: a SAMPLED cheap critic (~1-in-5 attempts,
// gemini-flash-class) ≈ $0.0002/attempt. A DOCUMENTED estimate so the NET (not gross) is shown today;
// refine once #2797's critic + its real sample rate are live. Override via opts.verificationCostPerAttempt.
const DEFAULT_VERIFICATION_COST_PER_ATTEMPT = 0.0002;
const MAX_ENTRIES = 2000; // velocity-relative window: judge on the most recent N records
const MAX_TAIL_BYTES = 2 * 1024 * 1024; // read at most the last 2MB of a JSONL — bounded memory ANY file size
const round = (value) => Math.round(value * 1e6) / 1e6;

// Parse only the TAIL of a JSONL (last MAX_TAIL_BYTES → bounded memory on any file size), keep the most
// recent MAX_ENTRIES; a malformed/truncated line is skipped, a missing file is [].
function readEntries(file) {
  let text;
  try {
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - MAX_TAIL_BYTES);
    const fd = fs.openSync(file, 'r');
    try { const buf = Buffer.alloc(size - start); fs.readSync(fd, buf, 0, size - start, start); text = buf.toString('utf8'); }
    finally { fs.closeSync(fd); }
  } catch { return []; }
  const parsed = [];
  for (const line of text.split('\n').filter(Boolean).slice(-MAX_ENTRIES)) {
    try { parsed.push(JSON.parse(line)); } catch { /* skip a partial/malformed line */ }
  }
  return parsed;
}

// aggregate(inputs) -> the metrics + net cost-of-quality + audit summary. Pure; all counts derived here.
function aggregate(inputs = {}) {
  const routing = inputs.routing || [];
  const escalations = inputs.escalations || [];
  const demotions = inputs.demotions || [];
  const haikuPer1k = inputs.haikuCostPer1k ?? DEFAULT_HAIKU_COST_PER_1K;
  const verifyPerAttempt = inputs.verificationCostPerAttempt ?? DEFAULT_VERIFICATION_COST_PER_ATTEMPT;

  const total = routing.length;
  const fleetAttempts = routing.filter((entry) => entry && entry.lane === 'fleet').length;
  const escalated = escalations.filter((entry) => entry && entry.event === 'fleet-dev-escalation').length;
  const accepted = Math.max(0, fleetAttempts - escalated);
  const perCall = (ASSUMED_TOKENS_PER_CALL / 1000) * haikuPer1k;

  const grossSaving = accepted * perCall;
  const verificationOverhead = fleetAttempts * verifyPerAttempt;
  return {
    fleet_development_share: total ? fleetAttempts / total : 0,
    escalation_rate: fleetAttempts ? escalated / fleetAttempts : 0,
    fleet_attempts: fleetAttempts, accepted, escalated, total_attempts: total,
    gross_saving_usd: round(grossSaving), verification_overhead_usd: round(verificationOverhead),
    net_cost_of_quality_usd: round(grossSaving - verificationOverhead),
    audit: auditSummary(demotions),
    assumptions: { assumed_tokens_per_call: ASSUMED_TOKENS_PER_CALL, haiku_cost_per_1k: haikuPer1k,
      verification_cost_per_attempt: verifyPerAttempt },
  };
}

// Human-audit surface (AC3): demotion patterns now; deny-list efficacy + critic drift placeholders pending
// #2798/#2797 — emergent failure modes a human should eyeball that the automated loops miss.
function auditSummary(demotions) {
  const byClass = Object.create(null); // null-proto: a hostile task_class ('__proto__') can't pollute
  for (const event of demotions) {
    if (event && event.event === 'fleet-dev-class-mis-profiled') byClass[event.task_class] = (byClass[event.task_class] || 0) + 1;
  }
  return { demotions_by_class: byClass, deny_list_efficacy: 'pending #2798', critic_drift: 'pending #2797' };
}

function buildReport(opts = {}) {
  const dir = path.join(process.env.HOME || '', '.megingjord');
  return aggregate({
    routing: opts.routing || readEntries(opts.routingPath || path.join(process.cwd(), 'logs', 'model-routing-telemetry.jsonl')),
    escalations: opts.escalations || readEntries(opts.escalationsPath || path.join(dir, 'fleet-dev-telemetry.jsonl')),
    demotions: opts.demotions || readEntries(opts.demotionsPath || path.join(dir, 'fleet-dev-governor.jsonl')),
    haikuCostPer1k: opts.haikuCostPer1k, verificationCostPerAttempt: opts.verificationCostPerAttempt,
  });
}

function formatReport(report) {
  return [
    'Fleet-dev observability — net cost-of-quality',
    `  fleet-development-share : ${(report.fleet_development_share * 100).toFixed(1)}%  (${report.fleet_attempts}/${report.total_attempts} attempts)`,
    `  escalation-rate         : ${(report.escalation_rate * 100).toFixed(1)}%  (${report.escalated} escalated, ${report.accepted} accepted)`,
    `  gross saving            : $${report.gross_saving_usd}`,
    `  - verification overhead : $${report.verification_overhead_usd}`,
    `  = NET cost-of-quality   : $${report.net_cost_of_quality_usd}  (G3 gain, net not gross)`,
    `  audit: demotions ${JSON.stringify(report.audit.demotions_by_class)} | deny-list ${report.audit.deny_list_efficacy} | critic ${report.audit.critic_drift}`,
  ].join('\n');
}

function main() { process.stdout.write(formatReport(buildReport()) + '\n'); }
if (require.main === module) main();

module.exports = { aggregate, buildReport, formatReport, readEntries };
