#!/usr/bin/env node
'use strict';
// flaw-capture-replay-eval — the advisory->blocking promotion gate for Epic #3425, replay-eval-gated
// and NEVER calendar-gated (per #1771/#1827/#3416). It scores the flaw-capture detector against a
// labelled corpus of historical review-points and decides, PER FRICTION CLASS, whether that class's
// surfacing is precise enough to flip from advisory to blocking — auto-revoking the moment a later
// eval drops below the bar.
//
// Promotion contract (research AC-R6):
//   - aggregate precision >= 0.85 AND no single class below 0.70;
//   - sample floors: >= 200 labelled review-points total, >= 15 per friction class, >= 30 per role —
//     below any floor the gate STAYS ADVISORY (a data-poor class never rides a data-rich one);
//   - only HIGH-confidence F6 contradictions are ever blocking-eligible (AC5);
//   - FLAW_CAPTURE_DISABLED=1 is a hard rollback no-op (AC6).

const fs = require('fs');
const path = require('path');

const AGG_PRECISION = 0.85;      // aggregate promotion bar
const CLASS_FLOOR_PRECISION = 0.70; // no single class may sit below this
const MIN_TOTAL = 200;           // total labelled review-points before a precision number is trusted
const MIN_PER_CLASS = 15;        // per-friction-class floor
const MIN_PER_ROLE = 30;         // per-role floor
const FRICTION_CLASSES = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
const DEFAULT_CORPUS = path.join(__dirname, '..', '..', 'tests', 'eval', 'flaw-capture-corpus.json');

// AC5: a corpus entry is blocking-eligible unless it is a non-high-confidence F6 contradiction.
function blockingEligible(entry) {
  return entry.friction_class !== 'F6' || entry.confidence === 'high';
}

function precisionOf(truePos, falsePos) {
  const denom = truePos + falsePos;
  return denom ? Number((truePos / denom).toFixed(4)) : null; // null = no surfaced samples to judge
}

// Score precision per class + per role + aggregate. precision = surfaced-and-real / all-surfaced.
function scoreCorpus(corpus) {
  const cases = Array.isArray(corpus) ? corpus : (corpus.samples || []);
  const perClass = {};
  const perRole = {};
  let aggTp = 0;
  let aggFp = 0;
  for (const entry of cases) {
    const cls = perClass[entry.friction_class] || (perClass[entry.friction_class] = { n: 0, tp: 0, fp: 0 });
    const role = perRole[entry.role] || (perRole[entry.role] = { n: 0 });
    cls.n += 1; role.n += 1;
    if (!entry.surfaced || !blockingEligible(entry)) continue; // only surfaced+eligible feed precision
    if (entry.is_real_flaw) { cls.tp += 1; aggTp += 1; } else { cls.fp += 1; aggFp += 1; }
  }
  for (const cls of Object.values(perClass)) cls.precision = precisionOf(cls.tp, cls.fp);
  return { n: cases.length, perClass, perRole,
    aggregatePrecision: precisionOf(aggTp, aggFp), aggTp, aggFp };
}

// Are the anti-skew sample floors met? (total, per-class, per-role).
function sampleFloorsMet(result) {
  if (result.n < MIN_TOTAL) return false;
  for (const cls of FRICTION_CLASSES) if (((result.perClass[cls] || {}).n || 0) < MIN_PER_CLASS) return false;
  for (const role of Object.values(result.perRole)) if (role.n < MIN_PER_ROLE) return false;
  return true;
}

// Per-class promotion: a class flips only when it has >= MIN_PER_CLASS samples AND precision >= floor.
function promotedClasses(result) {
  if (process.env.FLAW_CAPTURE_DISABLED === '1') return []; // AC6 rollback no-op
  return FRICTION_CLASSES.filter((cls) => {
    const stats = result.perClass[cls];
    return stats && stats.n >= MIN_PER_CLASS && stats.precision !== null && stats.precision >= CLASS_FLOOR_PRECISION;
  });
}

// Whole-system promotion eligibility: floors met AND aggregate>=bar AND no class below the floor.
function promotionEligible(result) {
  if (process.env.FLAW_CAPTURE_DISABLED === '1') return false; // AC6
  if (!sampleFloorsMet(result)) return false;
  if (result.aggregatePrecision === null || result.aggregatePrecision < AGG_PRECISION) return false;
  return FRICTION_CLASSES.every((cls) => {
    const stats = result.perClass[cls];
    return stats && stats.precision !== null && stats.precision >= CLASS_FLOOR_PRECISION;
  });
}

// The severity a given friction class's findings carry — 'error' once its class is promoted, else advisory.
// Auto-revoking: recomputed every run, so a regression below the bar reverts it to advisory automatically.
function blockingSeverityForClass(cls, result) {
  return promotedClasses(result).includes(cls) ? 'error' : 'advisory';
}

// Versioned observability record (G8).
function auditRecord(result, opts = {}) {
  return { schema: 'flaw-capture-replay-eval-v1', ts: opts.ts || null,
    n: result.n, aggregate_precision: result.aggregatePrecision,
    floors_met: sampleFloorsMet(result), promotion_eligible: promotionEligible(result),
    promoted_classes: promotedClasses(result),
    per_class: Object.fromEntries(Object.entries(result.perClass).map(([k, v]) => [k, { n: v.n, precision: v.precision }])) };
}

function loadCorpus(file = DEFAULT_CORPUS) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function runCli(argv = []) {
  const file = (argv.find((a) => a.startsWith('--corpus=')) || '').replace('--corpus=', '') || DEFAULT_CORPUS;
  const result = scoreCorpus(loadCorpus(file));
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify(auditRecord(result), null, 2) + '\n'); return 0; }
  process.stdout.write(`flaw-capture replay-eval over ${result.n} review-points: aggregate precision=${result.aggregatePrecision}\n`);
  for (const cls of FRICTION_CLASSES) {
    const stats = result.perClass[cls] || { n: 0, precision: null };
    process.stdout.write(`  ${cls}: n=${stats.n} precision=${stats.precision}\n`);
  }
  process.stdout.write(promotionEligible(result)
    ? '✓ promotion-eligible (flip advisory→blocking)\n'
    : `⚠ not promotion-eligible — STAY ADVISORY (floors_met=${sampleFloorsMet(result)}; promoted classes: ${promotedClasses(result).join(', ') || 'none'})\n`);
  return 0;
}

if (require.main === module) process.exit(runCli(process.argv.slice(2)));

module.exports = {
  AGG_PRECISION, CLASS_FLOOR_PRECISION, MIN_TOTAL, MIN_PER_CLASS, MIN_PER_ROLE, FRICTION_CLASSES,
  DEFAULT_CORPUS, blockingEligible, scoreCorpus, sampleFloorsMet, promotedClasses, promotionEligible,
  blockingSeverityForClass, auditRecord, loadCorpus, runCli,
};
