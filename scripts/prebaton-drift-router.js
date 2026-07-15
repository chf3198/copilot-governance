'use strict';
// prebaton-drift-router (#3421, Epic #3398 C3) — routes a pre-baton drift flag
// (PB1 semantic-supersession / PB2 inbound-orphan / PB3 stale-research-first /
// PB4 dependency-rot) INTO the Agile baton: a Manager-triage-seed ticket
// (type:correction, standard backlog→triage path) + a Tier-2 anneal event.
// Detection is no longer report-only (Epic AC3). Safety gate (research §5): a
// wrong autonomous cancel is the costly error, so an irreversible cancel of a
// P1/Epic item is NEVER auto-filed — it emits a human-approval proposal instead.
// Pure logic, no IO; the dispatch (prebaton-drift-route.js) performs the writes.

const PB_CLASSES = ['PB1', 'PB2', 'PB3', 'PB4'];
const EVIDENCE_CAP = 400;
const SEED_LABELS = ['type:task', 'type:correction', 'status:backlog', 'area:governance', 'anneal:tier-2'];

// Normalize a raw flag from C1 (orphan: {from, cls:PB2|PB4}) or C2
// (sweep: {ticket, flag:'superseded'|'partial'|'relevant', evidence, inbound})
// into a single shape. A confirmed 'superseded' verdict proposes a CANCEL; every
// other flag proposes a reversible SEED (re-home / re-triage).
function normalizeFlag(raw) {
  const src = raw || {};
  const ticket = Number(src.ticket != null ? src.ticket : src.from);
  let cls = PB_CLASSES.includes(src.cls) ? src.cls : null;
  let proposedAction = 'seed';
  if (src.flag === 'superseded') { cls = cls || 'PB1'; proposedAction = 'cancel'; }
  else if (src.flag === 'partial' || src.flag === 'relevant') { cls = cls || 'PB1'; }
  if (!cls) cls = 'PB2'; // orphan/dependency default
  return {
    ticket, cls, proposedAction,
    priority: (src.priority || 'P2').toUpperCase(),
    isEpic: src.isEpic === true || src.type === 'epic',
    evidence: src.evidence || src.reason || null,
    from: Array.isArray(src.inbound) ? src.inbound : (src.from != null ? [Number(src.from)] : []),
  };
}

// AC2 reversibility gate. Irreversible ⇔ the proposed action is a CANCEL of a
// P1 or Epic item — that alone requires the human gate. Everything else (seeds,
// re-homes, cancels of routine P2/P3 non-Epic items) is autonomous.
function classifyReversibility(flag) {
  const input = flag || {};
  const irreversible = input.proposedAction === 'cancel' && (input.priority === 'P1' || input.isEpic === true);
  return irreversible
    ? { reversible: false, gate: 'human', reason: 'irreversible cancel of a P1/Epic item — human approval required (research §5)' }
    : { reversible: true, gate: 'autonomous', reason: 'reversible seed/re-home or routine cancel — routes autonomously' };
}

// Manager-triage-seed ticket payload (standard backlog→triage path).
function buildTriageSeed(flag) {
  
  const froms = flag.from && flag.from.length ? ` (inbound from ${flag.from.map((n) => `#${n}`).join(', ')})` : '';
  const ev = flag.evidence ? `\n\nEvidence: ${String(flag.evidence).slice(0, EVIDENCE_CAP)}` : '';
  return {
    title: `Triage pre-baton drift (${flag.cls}) on #${flag.ticket}${froms}`,
    labels: [...SEED_LABELS],
    body: `Auto-routed by prebaton-drift-router (#3421). Pre-baton drift class **${flag.cls}** flagged on #${flag.ticket}; `
      + `Manager triage the flagged item and dispose (re-home / re-triage / supersede-with-evidence).${ev}\n\nParent: #3398\nRefs #${flag.ticket}`,
  };
}

// A human-approval proposal for the irreversible case — a seed that asks a human
// to confirm the cancel; it must NOT itself cancel anything.
function buildHumanProposal(flag) {
  const seed = buildTriageSeed(flag);
  return {
    ...seed,
    title: `[HUMAN-GATE] Confirm cancel of ${flag.isEpic ? 'Epic' : flag.priority} #${flag.ticket} (${flag.cls})`,
    labels: [...SEED_LABELS, 'needs:human-decision'],
    body: `Auto-routed by prebaton-drift-router (#3421). An irreversible **cancel** of a ${flag.isEpic ? 'Epic' : flag.priority} `
      + `item (#${flag.ticket}, ${flag.cls}) was flagged. Per research §5 a wrong cancel is the costly error, so this is NOT `
      + `auto-executed. A human must confirm before any cancel.${flag.evidence ? `\n\nEvidence: ${String(flag.evidence).slice(0, EVIDENCE_CAP)}` : ''}`
      + `\n\nParent: #3398\nRefs #${flag.ticket}`,
  };
}

// Tier-2 anneal event (schema-v3 shaped), pattern_id prebaton-drift-routed.
function buildAnnealEvent(flag, ts, env = 'ci') {
  return {
    ts, timestamp: ts, version: 3, service: 'prebaton-drift-router', env,
    event: 'drift-routed', severity: 'medium', trigger_role: 'system', anneal_tier: 'tier-2',
    pattern_id: 'prebaton-drift-routed', drift_class: flag.cls, ticket: flag.ticket,
    gate: classifyReversibility(flag).gate, proposed_action: flag.proposedAction,
    _summary: `pre-baton ${flag.cls} drift on #${flag.ticket} routed (${classifyReversibility(flag).gate})`,
  };
}

// Top-level: normalize → gate → build the routed artifacts. Never returns a
// direct-cancel instruction; the irreversible path yields a human proposal only.
function route(raw, ts, env = 'ci') {
  const flag = normalizeFlag(raw);
  if (!Number.isFinite(flag.ticket)) return { gate: 'skip', reason: 'no resolvable ticket number', anneal: null };
  const gate = classifyReversibility(flag);
  const anneal = buildAnnealEvent(flag, ts, env);
  if (gate.gate === 'human') return { gate: 'human', reason: gate.reason, humanProposal: buildHumanProposal(flag), seed: null, anneal, flag };
  return { gate: 'autonomous', reason: gate.reason, seed: buildTriageSeed(flag), humanProposal: null, anneal, flag };
}

module.exports = {
  PB_CLASSES, SEED_LABELS, normalizeFlag, classifyReversibility,
  buildTriageSeed, buildHumanProposal, buildAnnealEvent, route,
};
