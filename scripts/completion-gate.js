'use strict';

// completion-gate — hardens the stop/completion gate for `lane:code-change` (Epic #3799 AC4).
//
// The gate answers ONE question: is the Admin baton's *deliverable* done? A deliverable is done
// when the branch's COMMITTED change is clean (no uncommitted edits to the tracked deliverable) and
// CI is green. It is emphatically NOT a question about the pristineness of the working tree: the
// canonical checkout carries a permanent live-harness baseline of hundreds of untracked / unrelated
// files (the "718-untracked" drift). The prior blanket check conflated the two and, once
// `collaborator=true`, reported "Admin incomplete" on that drift — normalizing premature stops.
// Here, untracked and unrelated-modified counts are surfaced as *ignoredDrift* and NEVER block.
//
// For whatever Admin steps remain (push / PR / merge / …), the gate REUSES the AC2 taxonomy
// (`autonomy-classifier.classifySteps`) to say plainly whether the remainder is reversible-remaining
// (complete autonomously) or carve-out-remaining (escalate) — never a blanket "Admin incomplete."
//
// The module is pure + advisory: it decides nothing on its own and blocks nothing.

const fs = require('node:fs');
const path = require('node:path');
const { classifySteps } = require('./autonomy-classifier');

const COMPLETE = 'complete';
const BLOCKED = 'blocked';

// ── The corrected gate predicate ─────────────────────────────────────────────
// Pure. ctx = {
//   deliverable: { committedClean:boolean, ciStatus:'green'|'red'|'pending'|string },
//   untrackedCount:number,           // informational — NEVER a blocker
//   unrelatedModifiedCount:number,   // working-tree drift outside the deliverable — NEVER a blocker
//   remainingSteps: [ AC2 step objects ],
// }
// Returns { gate, blockers, ignoredDrift, remaining, message }.
function evaluateCompletion(ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const deliverable = c.deliverable && typeof c.deliverable === 'object' ? c.deliverable : {};
  const untrackedCount = Number.isFinite(c.untrackedCount) ? c.untrackedCount : 0;
  const unrelatedModifiedCount = Number.isFinite(c.unrelatedModifiedCount) ? c.unrelatedModifiedCount : 0;

  // Blockers are ONLY the committed deliverable + CI. Working-tree drift is deliberately excluded.
  const blockers = [];
  if (deliverable.committedClean !== true) {
    blockers.push('committed deliverable is not clean (tracked deliverable has uncommitted changes)');
  }
  const ci = String(deliverable.ciStatus || '').toLowerCase().trim();
  if (ci !== 'green') {
    blockers.push(`CI is not green (status: "${ci || '(unknown)'}")`);
  }

  const ignoredDrift = { untrackedCount, unrelatedModifiedCount };
  const remaining = classifySteps(Array.isArray(c.remainingSteps) ? c.remainingSteps : []);

  if (blockers.length) {
    return {
      gate: BLOCKED,
      blockers,
      ignoredDrift,
      remaining,
      message: `Admin baton BLOCKED — deliverable not done: ${blockers.join('; ')}. `
        + `(${untrackedCount} untracked + ${unrelatedModifiedCount} unrelated-modified file(s) ignored — not a completion blocker.)`,
    };
  }

  // Deliverable is done. Report the remaining-step disposition using the AC2 taxonomy.
  const driftNote = `${untrackedCount} untracked + ${unrelatedModifiedCount} unrelated-modified file(s) ignored (not a completion blocker)`;
  let message;
  if (!remaining.reversible.length && !remaining.carveOuts.length) {
    message = `Admin baton COMPLETE — committed deliverable clean + CI green; no steps remaining; ${driftNote}.`;
  } else if (remaining.escalateRequired) {
    const steps = remaining.carveOuts.map(v => v.reason).join('; ');
    message = `carve-out-remaining — ESCALATE to human: ${steps}. (${driftNote}.)`;
  } else {
    const steps = remaining.reversible.map(v => v.reason).join('; ');
    message = `reversible-remaining — COMPLETE autonomously: ${steps}. (${driftNote}.)`;
  }
  return { gate: COMPLETE, blockers, ignoredDrift, remaining, message };
}

// ── Low-false-positive structured-marker advisory (AC2 mold) ─────────────────
// A baton Admin/handoff doc MAY log a `Completion-Gate:` marker (and optionally a
// `Completion-Blocker:` reason). We validate ONLY markers that ARE present:
//   CG1  the marker value is not one of the known dispositions
//   CG2  the gate is `blocked` yet the recorded blocker names untracked / working-tree drift —
//        the exact annealed false positive (untracked drift is never a valid completion blocker
//        when the committed deliverable is clean + CI-green)
// A doc with no `Completion-Gate:` marker yields no finding — adoption is rewarded, silence is not
// penalized, so the current corpus produces zero false positives (no prose keyword matching).
const GATE_RE = /Completion-Gate:\s*`?([A-Za-z-]+)`?/i;
const BLOCKER_RE = /Completion-Blocker:\s*`?([^`\n\r]+?)`?\s*$/im;
const UNTRACKED_DRIFT_RE = /\b(untracked|working[- ]tree drift|718[- ]?untracked)\b/i;
const VALID_GATES = Object.freeze(['complete', 'blocked', 'reversible-remaining', 'carve-out-remaining']);

function parseCompletionGate(text) {
  const m = String(text || '').match(GATE_RE);
  return m ? m[1].toLowerCase() : null;
}

function parseCompletionBlocker(text) {
  const m = String(text || '').match(BLOCKER_RE);
  return m ? m[1].trim() : null;
}

// Pure. `docs = [{ file, text }]`. Returns { warnings: [{ code, file, message }] }.
function verifyGateDocs(docs) {
  const warnings = [];
  const push = (code, file, message) => warnings.push({ code, file, message });
  for (const d of Array.isArray(docs) ? docs : []) {
    const file = d && d.file ? String(d.file) : '(unknown)';
    const text = d && d.text ? String(d.text) : '';
    const gate = parseCompletionGate(text);
    if (gate === null) continue; // no marker → nothing to validate
    if (!VALID_GATES.includes(gate)) {
      push('CG1_malformed_completion_gate', file, `Completion-Gate value "${gate}" is not one of ${VALID_GATES.join('|')}`);
      continue;
    }
    if (gate === 'blocked') {
      const blocker = parseCompletionBlocker(text);
      if (blocker && UNTRACKED_DRIFT_RE.test(blocker)) {
        push('CG2_untracked_cited_as_blocker', file,
          `Completion-Gate is "blocked" citing untracked/working-tree drift ("${blocker}") — untracked drift is not a valid completion blocker when the committed deliverable is clean + CI-green`);
      }
    }
  }
  return { warnings };
}

// ── CLI-only doc scan ────────────────────────────────────────────────────────
// Recursively collect Admin/handoff baton docs under wiki/work-log/ (same surface AC2 scans).
function scanGateDocs(root) {
  const base = path.join(root, 'wiki', 'work-log');
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/(admin|handoff|completion)/i.test(e.name) && e.name.endsWith('.md')) {
        out.push({ file: path.relative(root, full), text: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(base);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

function repoRoot() {
  return path.resolve(__dirname, '..');
}

function main(argv) {
  const evalFlag = argv.indexOf('--evaluate');
  if (evalFlag !== -1 && argv[evalFlag + 1]) {
    let ctx;
    try { ctx = JSON.parse(argv[evalFlag + 1]); } catch (e) {
      console.log(`[completion-gate] --evaluate must be JSON: ${e.message}`);
      process.exit(0);
    }
    const v = evaluateCompletion(ctx);
    console.log(`[completion-gate] gate=${v.gate.toUpperCase()} — ${v.message}`);
    console.log(`  G8 decision: ${v.gate === COMPLETE && !v.remaining.escalateRequired ? 'COMPLETE autonomously (reversible)' : v.gate === BLOCKED ? 'BLOCKED (fix deliverable / CI)' : 'ESCALATE to human (carve-out remaining)'}`);
    process.exit(0);
  }
  const root = repoRoot();
  const { warnings } = verifyGateDocs(scanGateDocs(root));
  console.log(`[completion-gate] ADVISORY: scanned admin/handoff/completion docs, ${warnings.length} warning(s).`);
  for (const w of warnings) console.log(`  ⚠ ${w.file} [${w.code}] ${w.message}`);
  // Advisory-first: never fail the run.
  process.exit(0);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  COMPLETE,
  BLOCKED,
  evaluateCompletion,
  parseCompletionGate,
  parseCompletionBlocker,
  verifyGateDocs,
  scanGateDocs,
};
