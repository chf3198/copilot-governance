// stress-realism — Real baton-artifact emission for stress runs. Epic #1398 AC3+AC6+AC9.
// Hooks into stress-orchestrator (#1408) via onTicket; produces MANAGER → COLLABORATOR →
// ADMIN → CONSULTANT handoff strings with proper schema fields. Tracks per-handoff
// reliability (AC6). Supports concurrent-orchestration mode (AC9).
'use strict';

const HANDOFFS = ['MANAGER_HANDOFF', 'COLLABORATOR_HANDOFF', 'ADMIN_HANDOFF', 'CONSULTANT_CLOSEOUT'];
const SIGNERS = {
  MANAGER_HANDOFF: 'Cole Mason',
  COLLABORATOR_HANDOFF: 'Orla Harper',
  ADMIN_HANDOFF: 'Mira Reyes',
  CONSULTANT_CLOSEOUT: 'Yara Vale',
};
const TEAM_MODEL = 'claude-code:opus-4-7@anthropic';

function emitHandoff(kind, ticket) {
  const signer = SIGNERS[kind];
  if (!signer) throw new Error(`Unknown handoff kind: ${kind}`);
  const role = kind.split('_')[0].toLowerCase();
  return [
    `**${kind} — ${signer}**`,
    `ticket: ${ticket.id} (${ticket.lane})`,
    `Signed-by: ${signer} · Team&Model: ${TEAM_MODEL} · Role: ${role}`,
  ].join('\n');
}

function laneHandoffSequence(lane) {
  // config-only skips COLLABORATOR; docs-only skips ADMIN; trivial skips both.
  if (lane === 'config-only') return ['MANAGER_HANDOFF', 'ADMIN_HANDOFF', 'CONSULTANT_CLOSEOUT'];
  if (lane === 'docs-only') return ['MANAGER_HANDOFF', 'COLLABORATOR_HANDOFF', 'CONSULTANT_CLOSEOUT'];
  if (lane === 'trivial') return ['MANAGER_HANDOFF', 'CONSULTANT_CLOSEOUT'];
  return HANDOFFS;
}

async function runRealism(ticket, opts = {}) {
  const sequence = laneHandoffSequence(ticket.lane);
  const reliability = { total: 0, ok: 0, fail: 0, mean_ms: 0 };
  const events = [];
  for (const kind of sequence) {
    const t0 = Date.now();
    try {
      const artifact = emitHandoff(kind, ticket);
      events.push({ kind, artifact, ts: new Date().toISOString() });
      reliability.ok += 1;
    } catch (err) {
      reliability.fail += 1;
      events.push({ kind, error: err.message });
    }
    reliability.total += 1;
    reliability.mean_ms += Date.now() - t0;
    if (opts.onArtifact) await opts.onArtifact(events[events.length - 1]);
  }
  reliability.mean_ms = reliability.total ? reliability.mean_ms / reliability.total : 0;
  return { ticket_id: ticket.id, lane: ticket.lane, sequence, events, reliability };
}

async function runConcurrent(tickets, opts = {}) {
  const concurrency = opts.concurrency || tickets.length;
  const results = [];
  for (let i = 0; i < tickets.length; i += concurrency) {
    const batch = tickets.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(t => runRealism(t, opts)));
    results.push(...batchResults);
  }
  return results;
}

function aggregateReliability(results) {
  const total = results.reduce((sum, r) => sum + r.reliability.total, 0);
  const ok = results.reduce((sum, r) => sum + r.reliability.ok, 0);
  const fail = results.reduce((sum, r) => sum + r.reliability.fail, 0);
  const rate = total > 0 ? ok / total : 0;
  const compoundReliabilityAcrossNChain = (perStep, chain) => Math.pow(perStep, chain);
  const fourChain = compoundReliabilityAcrossNChain(rate, 4);
  return {
    transitions: total, ok, fail,
    per_handoff_rate: rate,
    four_chain_projected: fourChain,
  };
}

module.exports = {
  HANDOFFS, SIGNERS, TEAM_MODEL,
  emitHandoff, laneHandoffSequence,
  runRealism, runConcurrent, aggregateReliability,
};
