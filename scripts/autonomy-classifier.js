'use strict';

// autonomy-classifier — the reversible-vs-carveout taxonomy for Admin completion
// (Epic #3799 AC2). Answers the operator-autonomy question at the merge boundary:
// "may this remaining step be completed autonomously, or is it one of the four
// retained human carve-outs?"
//
// Reversible (autonomous by default): a feature-branch push, opening/updating a
// PR, or a squash-merge to an UNPROTECTED / wiki-mirror main — every one of these
// is undoable (delete the branch, close the PR, `git revert` the squash commit).
//
// Carve-out (escalate to the human): merge to a PROTECTED main / production, any
// genuinely irreversible act (tag/publish/history rewrite/delete), or anything
// that WEAKENS SECURITY (C-G4). These are the only retained carve-outs.
//
// Bias is fail-safe: an unknown / underspecified step classifies as carve-out, so
// the taxonomy never *weakens* a genuine carve-out (AC2 explicit non-goal). The
// module is pure + advisory; it decides nothing on its own and blocks nothing.

const fs = require('node:fs');
const path = require('node:path');

const REVERSIBLE = 'reversible';
const CARVE_OUT = 'carve-out';

// Actions we recognize. Anything else → carve-out (fail-safe).
const REVERSIBLE_ACTIONS = Object.freeze(['push', 'pr', 'pr-open', 'pr-update', 'branch']);
const MERGE_ACTIONS = Object.freeze(['merge', 'squash-merge', 'rebase-merge']);

// Pure. `step = { action, target, protectedTarget, production, securityWeakening,
// irreversible }`. Returns { classification, escalate, reason }.
function classifyStep(step) {
  const s = step && typeof step === 'object' ? step : {};
  const action = String(s.action || '').toLowerCase().trim();
  const target = String(s.target || '').toLowerCase().trim();
  const carve = (reason) => ({ classification: CARVE_OUT, escalate: true, reason });
  const ok = (reason) => ({ classification: REVERSIBLE, escalate: false, reason });

  // Highest-priority carve-outs — independent of action.
  if (s.securityWeakening === true) return carve('security-weakening (C-G4): always a carve-out');
  if (s.irreversible === true) return carve('explicitly irreversible (tag/publish/history/delete)');
  if (s.production === true) return carve('targets production');

  // Merge steps hinge on target protection.
  if (MERGE_ACTIONS.includes(action)) {
    if (s.protectedTarget === true) return carve(`merge to protected target "${target || 'main'}"`);
    if (s.protectedTarget === false) return ok(`merge to unprotected/mirror target "${target || 'main'}" is reversible (git revert)`);
    // Protection unknown → fail-safe.
    return carve(`merge target "${target || 'main'}" protection unknown → fail-safe carve-out`);
  }

  // Non-merge reversible actions.
  if (REVERSIBLE_ACTIONS.includes(action)) {
    return ok(`${action} is reversible (delete branch / close PR)`);
  }

  // Unknown action → fail-safe.
  return carve(`unrecognized action "${action || '(empty)'}" → fail-safe carve-out`);
}

// Summarize a set of remaining Admin steps.
function classifySteps(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const reversible = [];
  const carveOuts = [];
  for (const step of list) {
    const verdict = classifyStep(step);
    (verdict.classification === CARVE_OUT ? carveOuts : reversible).push({ step, ...verdict });
  }
  return { reversible, carveOuts, escalateRequired: carveOuts.length > 0 };
}

// ── Logged-decision advisory (validates what IS logged; never punishes silence) ─
// A baton Admin/handoff doc MAY log `Autonomy-Decision: reversible|carve-out`
// (G8). We validate only the markers that are present:
//   AUT1  the marker value is not one of reversible|carve-out
//   AUT2  the decision is `carve-out` yet the same doc records an autonomous /
//         completed merge (contradiction: a carve-out must escalate, not self-merge)
// A doc with no marker yields no finding — adoption is rewarded, silence is not
// penalized, so the current corpus produces zero false positives.
const DECISION_RE = /Autonomy-Decision:\s*`?([A-Za-z-]+)`?/i;
// Signals the doc records an autonomous/completed merge.
const AUTONOMOUS_MERGE_RE = /(autonomous(?:ly)?\s+(?:squash-)?merg|Merge-Mode:\s*`?autonomous|squash-merge(?:d| to main| complete))/i;

function parseAutonomyDecision(text) {
  const m = String(text || '').match(DECISION_RE);
  return m ? m[1].toLowerCase() : null;
}

// Pure. `docs = [{ file, text }]`. Returns { warnings: [{ code, file, message }] }.
function verifyAdminDocs(docs) {
  const warnings = [];
  const push = (code, file, message) => warnings.push({ code, file, message });
  for (const d of Array.isArray(docs) ? docs : []) {
    const file = d && d.file ? String(d.file) : '(unknown)';
    const text = d && d.text ? String(d.text) : '';
    const decision = parseAutonomyDecision(text);
    if (decision === null) continue; // no marker → nothing to validate
    if (decision !== REVERSIBLE && decision !== CARVE_OUT) {
      push('AUT1_malformed_autonomy_decision', file, `Autonomy-Decision value "${decision}" is not reversible|carve-out`);
      continue;
    }
    if (decision === CARVE_OUT && AUTONOMOUS_MERGE_RE.test(text)) {
      push('AUT2_carveout_auto_merged', file, 'decision is carve-out but the doc records an autonomous merge (a carve-out must escalate, not self-merge)');
    }
  }
  return { warnings };
}

// ── CLI-only doc scan ────────────────────────────────────────────────────────
// Recursively collect Admin/handoff baton docs under wiki/work-log/.
function scanAdminDocs(root) {
  const base = path.join(root, 'wiki', 'work-log');
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/(admin|handoff)/i.test(e.name) && e.name.endsWith('.md')) {
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
  const stepFlag = argv.indexOf('--step');
  if (stepFlag !== -1 && argv[stepFlag + 1]) {
    let step;
    try { step = JSON.parse(argv[stepFlag + 1]); } catch (e) {
      console.log(`[autonomy-classifier] --step must be JSON: ${e.message}`);
      process.exit(0);
    }
    const v = classifyStep(step);
    console.log(`[autonomy-classifier] ${v.classification.toUpperCase()} — ${v.reason}`);
    console.log(`  G8 decision: ${v.escalate ? 'ESCALATE to human (retained carve-out)' : 'COMPLETE autonomously (reversible)'}`);
    process.exit(0);
  }
  const root = repoRoot();
  const { warnings } = verifyAdminDocs(scanAdminDocs(root));
  console.log(`[autonomy-classifier] ADVISORY: scanned admin/handoff docs, ${warnings.length} warning(s).`);
  for (const w of warnings) console.log(`  ⚠ ${w.file} [${w.code}] ${w.message}`);
  // Advisory-first: never fail the run.
  process.exit(0);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  REVERSIBLE,
  CARVE_OUT,
  classifyStep,
  classifySteps,
  parseAutonomyDecision,
  verifyAdminDocs,
  scanAdminDocs,
};
