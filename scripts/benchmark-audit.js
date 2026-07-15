#!/usr/bin/env node
'use strict';
// benchmark-audit.js (#3152, Epic #3147 S4): the full repo-wide benchmark-coverage audit. It reports
// two complementary gap classes so no qualifying surface is silently un-benchmarked:
//   (1) stress-surface gaps — modules meeting stress-applicability criteria but lacking a stress spec
//       (reuses stress-surface-audit.audit(), the #1875 classifier — no duplicated signal logic);
//   (2) metric-suite gaps — config/metric-catalog.yml workflows whose declared benchmark `suite`
//       spec is absent from the tree (the long-tail backfill the catalog promises).
// Deterministic, local, $0 — no LLM, no network. Mirrors benchmark-gate's missing-suite shape.
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { audit: stressAudit } = require('./stress-surface-audit.js');

const ROOT = path.resolve(__dirname, '..', '..');
const CATALOG_PATH = path.join(ROOT, 'config', 'metric-catalog.yml');

/** Load the metric catalog (resilient: absent/corrupt/shapeless -> {workflows:{}}).
 * @param {string} [file] @returns {{version?:number, workflows:object}} */
function loadCatalog(file = CATALOG_PATH) {
  try {
    const doc = yaml.load(fs.readFileSync(file, 'utf8'));
    return doc && typeof doc === 'object' && doc.workflows ? doc : { workflows: {} };
  } catch { return { workflows: {} }; }
}

/** Catalog workflows whose declared benchmark suite spec is absent from the tree.
 * @param {object} [catalog] @param {string} [root] @returns {object[]} */
function metricSuiteGaps(catalog = loadCatalog(), root = ROOT) {
  const workflows = (catalog && catalog.workflows) || {};
  const gaps = [];
  for (const [workflow, spec] of Object.entries(workflows)) {
    const suite = spec && spec.suite;
    if (!suite) { gaps.push({ workflow, suite: null, reason: 'no-suite-declared' }); continue; }
    if (fs.existsSync(path.join(root, suite))) continue;
    gaps.push({ workflow, suite, metric: (spec && spec.metric) || null,
      baseline: spec && spec.baseline != null ? spec.baseline : null,
      target: spec && spec.target != null ? spec.target : null,
      backfill_ticket: (spec && spec.backfill_ticket) || null });
  }
  return gaps;
}

/** Full benchmark-coverage audit: stress-surface gaps + metric-suite gaps.
 * @param {object} [opts] {catalog, catalogPath, root, stressAudit} (injectable for tests).
 * @returns {{stressGaps:object[], metricSuiteGaps:object[], ok:boolean}} */
function auditBenchmarkCoverage(opts = {}) {
  const catalog = opts.catalog || loadCatalog(opts.catalogPath);
  const stressGaps = (opts.stressAudit || stressAudit)();
  const suiteGaps = metricSuiteGaps(catalog, opts.root);
  return { stressGaps, metricSuiteGaps: suiteGaps,
    ok: stressGaps.length === 0 && suiteGaps.length === 0 };
}

function main() {
  const report = auditBenchmarkCoverage();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write('\nBenchmark-coverage audit (#3152, Epic #3147 S4):\n');
    process.stdout.write(`  stress-surface gaps: ${report.stressGaps.length}\n`);
    process.stdout.write(`  metric-suite gaps:   ${report.metricSuiteGaps.length}\n\n`);
    for (const gap of report.metricSuiteGaps) {
      const ticket = gap.backfill_ticket ? ` (${gap.backfill_ticket})` : '';
      process.stdout.write(`  [metric] ${gap.workflow} -> ${gap.suite || '(none declared)'}${ticket}\n`);
    }
  }
  if (process.argv.includes('--strict') && !report.ok) process.exit(1);
}

if (require.main === module) main();

module.exports = { auditBenchmarkCoverage, metricSuiteGaps, loadCatalog, CATALOG_PATH };
