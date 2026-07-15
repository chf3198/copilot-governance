'use strict';

// epic-baton-shadow-metric (#3800 AC4, Phase-1) — SHADOW-PERIOD metric for the Epic-child
// bundling-drift advisory (EB1/EB2/EB3 from epic-child-baton-traceability). It measures the
// advisory's finding-rate over the corpus a blocking Epic-close gate would scan, and computes a
// DATA-DRIVEN `promotionReadiness` verdict per AC4's "< 2% FP" rule.
//
// ADVISORY-ONLY. This does NOT flip EB1/EB2/EB3 to a blocking gate. Promotion is deferred to AC5
// (historical backfill / grandfathering) + a tracked-tree-scoped gate wiring — see 3800.md. The CLI
// always exits 0.
//
// Honest metric definition (the FP-vs-true-positive distinction matters):
//   findingRate(corpus) = flaggedChildren / auditableChildren
//     auditableChildren = children of CLOSED epics (the population a close-gate would judge).
//   A true FALSE-positive rate needs a labeled corpus; findingRate on the TRACKED (committed) corpus
//   is a sound UPPER BOUND on a CI-wired gate's block-rate there (every finding would block a close),
//   so `promotionReadiness` keys off it.
//   The WORKING-TREE (untracked mirror) corpus is the historical BACKLOG — pre-existing TRUE positives
//   (real bundling drift), NOT false positives; it is the AC5 backfill scope. A gate wired like the
//   current advisory scans the working tree, so a non-zero backlog means promotion must DEFER (else it
//   bricks every commit on historical instances).

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { auditEpics, scanMirror } = require('./epic-child-baton-traceability');

const PROMOTION_THRESHOLD = 0.02; // AC4: promote only at < 2%.
const CLOSED_RE = /^(closed|done|cancelled)$/i;

// Pure. `tickets` = the epic-child ticket shape. Returns the per-corpus finding metric.
function corpusMetric(tickets) {
  const list = Array.isArray(tickets) ? tickets : [];
  const byNumber = new Map(list.map((t) => [t.number, t]));
  const closedEpics = new Set(
    list
      .filter((t) => String(t.type || '').toLowerCase() === 'epic' && CLOSED_RE.test(String(t.status || '').trim()))
      .map((t) => t.number),
  );
  let auditableChildren = 0;
  for (const t of list) {
    if (t.refsEpic && closedEpics.has(t.refsEpic) && byNumber.has(t.number)) auditableChildren++;
  }
  const { warnings } = auditEpics(list);
  const flaggedChildren = new Set(warnings.filter((w) => w.child != null).map((w) => w.child)).size;
  const byCode = warnings.reduce((acc, w) => { acc[w.code] = (acc[w.code] || 0) + 1; return acc; }, {});
  const findingRate = auditableChildren ? flaggedChildren / auditableChildren : 0;
  return { auditableChildren, flaggedChildren, totalWarnings: warnings.length, byCode, findingRate };
}

// Pure. Decide promotion readiness from the tracked + (optional) worktree metrics.
// Ready ONLY when the tracked finding-rate is < threshold AND there is no working-tree historical
// backlog a naively-wired gate would brick on.
function promotionReadiness(trackedMetric, worktreeMetric) {
  const trackedUnderThreshold = trackedMetric.findingRate < PROMOTION_THRESHOLD;
  const backlog = worktreeMetric ? worktreeMetric.flaggedChildren : null;
  const ready = trackedUnderThreshold && (backlog == null || backlog === 0);
  const pct = (trackedMetric.findingRate * 100).toFixed(2);
  let reason;
  if (!trackedUnderThreshold) {
    reason = `tracked finding-rate ${pct}% ≥ ${PROMOTION_THRESHOLD * 100}% — NOT ready to promote`;
  } else if (backlog && backlog > 0) {
    reason = `tracked finding-rate ${pct}% < ${PROMOTION_THRESHOLD * 100}% BUT ${backlog} historical `
      + 'working-tree instance(s) remain — DEFER promotion pending AC5 backfill + a tracked-tree-scoped gate wiring';
  } else {
    reason = `tracked finding-rate ${pct}% < ${PROMOTION_THRESHOLD * 100}% and no working-tree backlog `
      + '— a tracked-tree-scoped blocking Epic-close gate is safe to promote';
  }
  return { ready, trackedUnderThreshold, threshold: PROMOTION_THRESHOLD, backlog, reason };
}

// Pure. Combine both corpora into the full shadow metric.
function shadowMetric({ trackedTickets = [], worktreeTickets = null } = {}) {
  const tracked = corpusMetric(trackedTickets);
  const worktree = worktreeTickets ? corpusMetric(worktreeTickets) : null;
  return { threshold: PROMOTION_THRESHOLD, tracked, worktree, promotionReadiness: promotionReadiness(tracked, worktree) };
}

// ── CLI corpus acquisition (impure) ──────────────────────────────────────────
// worktree corpus = the on-disk wiki dir (what a naively-wired gate would scan).
// tracked corpus  = the git-committed subset of that dir; falls back to the worktree scan when git is
// unavailable (e.g. a clean `.git`-less archive) or on any error — in a clean checkout the two are
// identical anyway, so the fallback is sound.
function scanCorpora(repoRoot) {
  const dir = path.join(repoRoot, 'wiki', 'work-log', 'tickets');
  const worktreeTickets = scanMirror(dir);
  let trackedTickets = worktreeTickets;
  try {
    const rel = path.relative(repoRoot, dir).split(path.sep).join('/');
    const out = cp.execFileSync('git', ['-C', repoRoot, 'ls-tree', '-r', '--name-only', 'HEAD', '--', rel],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const tracked = new Set(out.split('\n').map((s) => s.trim()).filter(Boolean).map((p) => path.basename(p)));
    if (tracked.size) trackedTickets = worktreeTickets.filter((t) => tracked.has(t.file));
  } catch (_) { /* git unavailable → fall back to worktree scan (identical in a clean checkout) */ }
  return { trackedTickets, worktreeTickets };
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const m = shadowMetric(scanCorpora(repoRoot));
  console.log('[epic-baton-shadow-metric] SHADOW-PERIOD metric (Epic-close bundling-drift, EB1/EB2/EB3):');
  console.log(`  tracked corpus : ${m.tracked.flaggedChildren}/${m.tracked.auditableChildren} flagged `
    + `(finding-rate ${(m.tracked.findingRate * 100).toFixed(2)}%), warnings ${m.tracked.totalWarnings}`);
  if (m.worktree) {
    console.log(`  worktree corpus: ${m.worktree.flaggedChildren}/${m.worktree.auditableChildren} flagged `
      + `(finding-rate ${(m.worktree.findingRate * 100).toFixed(2)}%), warnings ${m.worktree.totalWarnings} — historical backlog`);
  }
  console.log(`  promotion: ${m.promotionReadiness.ready ? 'READY' : 'DEFER'} — ${m.promotionReadiness.reason}`);
  process.exit(0); // advisory-first: metric never fails the run
}

if (require.main === module) main();

module.exports = { corpusMetric, promotionReadiness, shadowMetric, scanCorpora, PROMOTION_THRESHOLD };
