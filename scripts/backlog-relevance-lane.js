'use strict';
// backlog-relevance-lane (#3420, Epic #3398 C2) — async orchestration for the
// opt-in `--semantic` supersession lane. Composes the pure logic
// (backlog-relevance-sweep.js), the C1 inbound check (#3419), and a fleet-first
// $0 verdict cascade (fleet → free-cloud failover → deterministic floor). Every
// ticket blob is G4-redacted before it leaves the machine. NEVER escalates to a
// paid tier: an all-$0-tiers-down cascade fails closed to the floor (`relevant`).
const lib = require('./backlog-relevance-sweep');
const { scanInbound } = require('./inbound-reference-integrity');

// Parse a model reply into the verdict + evidence-binding payload. Fail-safe:
// an unparseable reply is a NON-superseded vote (a wrong cancel is the costly error).
function parseModelVerdict(text) {
  const reply = String(text || '');
  const superseded = /\bSUPERSEDED\b/i.test(reply) && !/\bNOT[\s-]*SUPERSEDED\b/i.test(reply);
  const sm = reply.match(/score[:\s]+([01](?:\.\d+)?)/i);
  const score = sm ? Math.min(Math.max(parseFloat(sm[1]), 0), 1) : 0;
  const am = reply.match(/artifact[_\s-]*id[:\s]+#?(\S+)/i);
  const rm = reply.match(/rationale[:\s]+(.+)/i);
  const evidence = am ? { artifact_id: am[1].replace(/[.,]$/, ''), contribution_score: score, rationale: rm ? rm[1].trim() : '' } : null;
  return { superseded, score, evidence };
}

// The deterministic floor: no $0 substrate reachable → emit a single non-superseded
// vote so the lane can never flag a cancel without a live model behind it.
function floorResult() { return { verdicts: [{ superseded: false, score: 0 }], evidence: null, route: 'deterministic-floor' }; }

// Fleet-first cascade for ONE candidate. `fleetPanel`/`freeCloudPanel` each return
// an array of raw model replies (N models) or throw/([]) on availability failure.
async function verdictCascade(prompt, deps) {
  for (const [route, panel] of [['fleet', deps.fleetPanel], ['free-cloud', deps.freeCloudPanel]]) {
    if (typeof panel !== 'function') continue;
    let replies = null;
    try { replies = await panel(prompt); } catch { replies = null; }
    if (Array.isArray(replies) && replies.length) {
      const parsed = replies.map(parseModelVerdict);
      const evidence = parsed.map((p) => p.evidence).find(Boolean) || null;
      return { verdicts: parsed.map((p) => ({ superseded: p.superseded, score: p.score })), evidence, route };
    }
  }
  return floorResult();
}

function buildPrompt(issue, redactString) {
  const blob = lib.redactForDispatch(`#${issue.number} ${issue.title || ''}\n${issue.body || ''}`, redactString);
  return `Backlog-drift review. Is this dormant ticket's goal already SUPERSEDED by shipped work?\n${blob}\n`
    + 'Reply: SUPERSEDED or NOT-SUPERSEDED; score: <0..1>; artifact_id: #<N>; rationale: <one line>.';
}

// Main entry: returns one flag record per scanned candidate.
async function runSemanticLane(issues, deps = {}) {
  const openItems = (Array.isArray(issues) ? issues : [])
    .map((n) => ({ number: n.number, text: `${n.title || ''}\n${n.body || ''}` }));
  const candidates = lib.selectCandidates(issues, {
    classify: deps.classify, recencyOf: deps.recencyOf, quantile: deps.quantile, forceScan: deps.forceScan,
  });
  const ranked = lib.rankByEmbedding(candidates, deps.queryVec, deps.embedOf);
  const flags = [];
  for (const issue of ranked) {
    const result = await verdictCascade(buildPrompt(issue, deps.redactString), deps);
    const verdict = lib.aggregateVerdict(result.verdicts);
    const evidence = verdict.label === 'superseded' ? lib.validateEvidence(result.evidence) : { valid: false, reason: 'n/a' };
    const inboundOrphans = scanInbound(issue.number, openItems);
    const decision = lib.classifyFlag({ verdict, inboundOrphans, evidence });
    flags.push({
      ticket: issue.number, flag: decision.flag, reason: decision.reason, route: result.route,
      medianScore: verdict.medianScore, n: verdict.n, veto: verdict.veto,
      evidence: decision.flag === 'superseded' ? result.evidence : null,
      inbound: inboundOrphans.map((o) => o.from),
    });
  }
  return { scanned: ranked.length, flags };
}

module.exports = { runSemanticLane, verdictCascade, parseModelVerdict, buildPrompt, floorResult };
