'use strict';
// epic-scaffold (#3713, Epic #3255 Phase-1) — the single source of "how a research-first
// Epic is born". Pure builders + a thin `gh` CLI that emit a compliant Epic (correct label
// set + a just-in-time body with ZERO dev-ACs) and EXACTLY ONE blocking R&P child, so any
// team lands on the canonical shape by default. $0 (no model calls). Per Phase-0 #3256 §3
// this adds NO new rule — it PRE-SATISFIES the canonical validators, proven by a round-trip
// self-check against research-first-phase-gate.js + epic-ac-traceability.js (the single
// source of truth; a scaffold whose own output fails them fails CI).
const phaseGate = require('./megalint/research-first-phase-gate');
const traceability = require('./megalint/epic-ac-traceability');

const RUBRIC_FLOOR = 7;

function normPriority(priority) { return `priority:${String(priority || 'P2').replace(/^priority:/i, '')}`; }
function normArea(area) { const value = String(area || 'governance'); return value.startsWith('area:') ? value : `area:${value}`; }

// Neutralize free-text (title/goal) before interpolation: collapse newlines and defuse
// checkbox-AC syntax so a hostile title cannot smuggle a dev-AC into the JIT Epic body.
function sanitizeText(text) { return String(text || '').replace(/[\r\n]+/g, ' ').replace(/\[[ xX]\]/g, '( )').trim(); }

// Canonical research-first Epic labels: role:manager + status:backlog + the phase-gate label.
function buildEpicLabels(opts = {}) {
  return ['type:epic', 'phase-gate:research-first', 'role:manager', 'status:backlog', normPriority(opts.priority), normArea(opts.area)];
}

// The single blocking R&P child: type:research + phase-gate:research-first + lane:docs-research.
function buildResearchChildLabels(opts = {}) {
  return ['type:research', 'phase-gate:research-first', 'lane:docs-research', 'status:backlog', normPriority(opts.priority), normArea(opts.area)];
}

// Epic body — research-first, JIT: NO checkbox dev-ACs (none may exist until the gate closes),
// exactly one R&P gate reference. `childNumber` is injected once the gate child is created.
function buildEpicBody(opts = {}) {
  const gateRef = opts.childNumber ? `#${opts.childNumber}` : '(the R&P gate child, filed as the single sub-issue)';
  const title = sanitizeText(opts.title) || 'untitled';
  const goal = sanitizeText(opts.goal || opts.title) || 'Define (research-first), then build, the capability below.';
  return `## Epic — ${title} (research-first)\n\n`
    + `> Scaffolded by epic-scaffold (#3713). This is a **research-first Epic**: no implementation child and no\n`
    + `> development AC exists until the single Phase-0 R&P gate closes.\n\n`
    + `## Goal\n${goal}\n\n`
    + `## Phase gate (Phase Gate Rule)\n`
    + `- **Exactly one** blocking R&P child (the single gate): ${gateRef} — NOT multiple reactive research children.\n`
    + `- **Just-in-time:** implementation children and development ACs are authored only AFTER the gate closes with\n`
    + `  Consultant rubric \`min(G1..G9) >= ${RUBRIC_FLOOR}\` **and** a Manager \`EPIC_RESCOPE\` comment.\n`
    + `- **Traceability:** every Phase-1 child cites the Phase-0 child it consumes (\`Refs #N\`).\n`
    + `- **Re-arm on reopen:** if the gate child reopens, the gate re-arms and Phase-1 pauses.\n\n`
    + `Enforcement lives in the canonical validators (this Epic does not restate them):\n`
    + `\`instructions/epic-governance.instructions.md\`, \`research-first-phase-gate.js\`, \`epic-ac-traceability.js\`.\n`;
}

// R&P gate child body — states the min(G1..G9)>=7 + EPIC_RESCOPE unlock contract.
function buildResearchChildBody(opts = {}, epicNumber) {
  return `## Phase-0: Research & Planning — single blocking gate\n\n`
    + `Parent: ${epicNumber ? `#${epicNumber}` : '(the scaffolded Epic)'}\n`
    + `The single Phase-0 gate for this research-first Epic.\n\n`
    + `## Unlock contract\nThis gate closes ONLY with Consultant peer-review rubric \`min(G1..G9) >= ${RUBRIC_FLOOR}\`;\n`
    + `on close the Manager posts \`EPIC_RESCOPE\` and only then may Phase-1 children be authored.\n\n`
    + `## Deliverable\nA consolidated, durable design-of-record (single doc) for the Epic's goal.\n\n`
    + `${epicNumber ? `Refs #${epicNumber}` : ''}`;
}

// Composition self-check (AC2): the scaffold's OWN output must pass the canonical validators
// with zero violations — the validators stay authoritative; the scaffold is a pre-satisfier.
function roundTripCheck({ epicLabels, epicBody, epicNumber, childNumber }) {
  const gateResult = phaseGate.validate({ labels: epicLabels, body: epicBody, comments: [] });
  const traceResult = traceability.validate({
    labels: epicLabels, body: epicBody, issueNumber: epicNumber || null,
    linkedChildren: childNumber ? [childNumber] : [], isClosingAttempt: false,
  });
  const violations = [
    ...gateResult.violations.map((viol) => ({ validator: 'research-first-phase-gate', ...viol })),
    ...traceResult.violations.map((viol) => ({ validator: 'epic-ac-traceability', ...viol })),
  ];
  return { ok: violations.length === 0, violations };
}

// G8 provenance line — auditable without new infrastructure.
function provenanceRecord(epicNumber, childNumber, validatorsOk) {
  return `epic-scaffold: created #${epicNumber} + gate #${childNumber}, validators=${validatorsOk ? 'pass' : 'FAIL'}`;
}

// Build the full scaffold plan (pure). The CLI apply path creates the Epic, then the gate
// child, then injects the child ref and re-validates before emitting provenance.
function planScaffold(opts = {}) {
  return {
    epic: { labels: buildEpicLabels(opts), body: buildEpicBody(opts), title: opts.title },
    child: { labels: buildResearchChildLabels(opts), bodyFor: (epicNumber) => buildResearchChildBody(opts, epicNumber) },
  };
}

module.exports = {
  RUBRIC_FLOOR, normPriority, normArea, buildEpicLabels, buildResearchChildLabels,
  buildEpicBody, buildResearchChildBody, roundTripCheck, provenanceRecord, planScaffold,
};
