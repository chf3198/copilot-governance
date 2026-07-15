'use strict';

// epic-baton-backfill-plan (#3800 AC5, Phase-1) — DRY-RUN historical backfill PLANNER for the
// pre-existing Epic-child bundling-drift instances (EB1/EB2/EB3 flagged by
// epic-child-baton-traceability). It produces the deterministic classification a future
// promotion-to-blocking (a separate child) needs — WITHOUT fabricating any governance evidence.
//
// INTEGRITY (the whole point): this NEVER writes a `CONSULTANT_CLOSEOUT` / `GitHub Evidence Block`
// onto a historical ticket. Backfilling closeout prose onto long-merged tickets manufactures evidence
// (the 1893.md MC3 precedent — LEAVE it). Instead it classifies each flagged instance and emits a
// dry-run exemption manifest; nothing is mutated, nothing is fabricated. Advisory-first CLI (exit 0).
//
// Classification (deterministic):
//   hasEvidence   — a REAL sibling evidence artifact exists (wiki/work-log/ticket-<N>/*closeout* etc.)
//                   or the ticket itself is not truly missing evidence: record a POINTER to real
//                   evidence; no new prose.
//   grandfather   — created BEFORE the #3800 guard cutoff → predates the per-child-evidence rule →
//                   EXEMPT from a future BLOCKING gate. The ADVISORY still reports it (transparency
//                   preserved — nothing is silenced or whitewashed).
//   mustRemediate — post-cutoff and genuinely un-evidenced → NOT exempt; needs a real per-child baton
//                   (human/role work). Never auto-backfilled.

const fs = require('node:fs');
const path = require('node:path');
const { auditEpics, scanMirror } = require('./epic-child-baton-traceability');

// #3800 per-child-evidence guard introduction date (from wiki/work-log/tickets/3800.md `created`).
const GUARD_CUTOFF_ISO = '2026-07-14';

const day = (s) => (s ? String(s).slice(0, 10) : null);

// Pure. ticket = { number, created (ISO|null), hasSiblingEvidence (bool) }. Returns a category.
function classifyInstance(ticket, cutoffISO = GUARD_CUTOFF_ISO) {
  if (ticket && ticket.hasSiblingEvidence) return 'hasEvidence';
  const created = day(ticket && ticket.created);
  if (created && created < day(cutoffISO)) return 'grandfather';
  return 'mustRemediate';
}

// Pure. flaggedTickets = [{ number, created, hasSiblingEvidence }]. Returns the dry-run plan.
function backfillPlan(flaggedTickets, { cutoffISO = GUARD_CUTOFF_ISO } = {}) {
  const groups = { grandfather: [], hasEvidence: [], mustRemediate: [] };
  for (const t of Array.isArray(flaggedTickets) ? flaggedTickets : []) {
    groups[classifyInstance(t, cutoffISO)].push(t.number);
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => a - b);
  const total = groups.grandfather.length + groups.hasEvidence.length + groups.mustRemediate.length;
  return {
    cutoffISO: day(cutoffISO),
    dryRun: true,
    fabricates: false, // invariant: this planner never writes closeout/evidence prose
    grandfather: groups.grandfather,
    hasEvidence: groups.hasEvidence,
    mustRemediate: groups.mustRemediate,
    summary: {
      total,
      grandfather: groups.grandfather.length,
      hasEvidence: groups.hasEvidence.length,
      mustRemediate: groups.mustRemediate.length,
    },
  };
}

// ── CLI corpus acquisition (impure) ──────────────────────────────────────────
const EVIDENCE_FILE_RE = /(closeout|consultant|evidence|admin)/i;

function readCreated(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    const m = txt.match(/^created:\s*"?(\d{4}-\d{2}-\d{2})/m) || txt.match(/^last_updated:\s*"?(\d{4}-\d{2}-\d{2})/m);
    return m ? m[1] : null;
  } catch (_) { return null; }
}

function siblingEvidenceExists(repoRoot, n) {
  const dir = path.join(repoRoot, 'wiki', 'work-log', `ticket-${n}`);
  try {
    return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => EVIDENCE_FILE_RE.test(f));
  } catch (_) { return false; }
}

// Build the flagged-instance list (with dates + sibling-evidence signal) from the on-disk mirror.
function scanFlagged(repoRoot) {
  const dir = path.join(repoRoot, 'wiki', 'work-log', 'tickets');
  const tickets = scanMirror(dir);
  const byNum = new Map(tickets.map((t) => [t.number, t]));
  const { warnings } = auditEpics(tickets);
  const flaggedNums = [...new Set(warnings.filter((w) => w.child != null).map((w) => w.child))];
  return flaggedNums.map((n) => {
    const t = byNum.get(n);
    return {
      number: n,
      created: t ? readCreated(path.join(dir, t.file)) : null,
      hasSiblingEvidence: siblingEvidenceExists(repoRoot, n),
    };
  });
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const plan = backfillPlan(scanFlagged(repoRoot));
  console.log('[epic-baton-backfill-plan] DRY-RUN historical exemption manifest '
    + `(cutoff ${plan.cutoffISO}, fabricates=${plan.fabricates}):`);
  console.log(`  total flagged historical children: ${plan.summary.total}`);
  console.log(`  grandfather (pre-cutoff → exempt from a future blocking gate): ${plan.summary.grandfather}`);
  console.log(`  has-real-evidence-elsewhere (pointer, no new prose): ${plan.summary.hasEvidence}`);
  console.log(`  must-remediate (post-cutoff, needs a real per-child baton): ${plan.summary.mustRemediate}`);
  if (plan.mustRemediate.length) {
    console.log(`  ⚠ must-remediate: ${plan.mustRemediate.map((x) => `#${x}`).join(', ')}`);
  }
  console.log('  NOTE: dry-run only — no ticket is mutated and NO closeout/evidence prose is fabricated.');
  process.exit(0); // advisory-first: planner never fails the run
}

if (require.main === module) main();

module.exports = { classifyInstance, backfillPlan, scanFlagged, GUARD_CUTOFF_ISO };
