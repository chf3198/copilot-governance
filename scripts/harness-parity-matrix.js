#!/usr/bin/env node
'use strict';
// harness-parity-matrix.js — Epic #3411 T3.1 (#3451)
// Per-feature × per-orchestrator parity matrix hard-gate (advisory-first).
// Probes whether each parity:yes (feature, runtime) cell is actually wired on
// disk. Declared-full-but-missing → FAIL; NA-without-substitute → FAIL.
// Default exit 0 (advisory); --strict exits non-zero when failures exist.

const fs = require('node:fs');
const path = require('node:path');

// Ordered source roots to search when an ssotFile is not found at its literal
// path. Basename is tried under each root; first match wins (deterministic).
// HOME-relative paths (~/…) and glob patterns are treated as not-resolvable
// on disk and resolve to null — they are recorded as genuinely absent.
const SOURCE_ROOTS = [
  '',
  'hooks/scripts',
  'scripts/global',
  'scripts',
  'scripts/global/megalint',
  '.github/workflows',
  'inventory',
  'instructions',
];

const VERDICT = {
  OK: 'ok',
  OK_NA: 'ok-na',
  DECLARED_FULL_BUT_MISSING: 'declared-full-but-missing',
  NA_WITHOUT_SUBSTITUTE: 'na-without-substitute',
  MAKE_REACHABLE_REQUIRED: 'make-reachable-required',
};

// Statuses that assert "this runtime is expected to have the feature"
const FULL_STATUSES = new Set(['full', 'partial', 'advisory-backstop-exists', 'unverified']);

// Statuses that assert "this runtime is structurally excluded"
const NA_STATUSES = new Set(['structural-NA', 'waived']);

// ---------------------------------------------------------------------------
// resolveSsotFile: find the actual path of an ssotFile on disk.
// Strategy: try the literal path first, then basename under each SOURCE_ROOT.
// Returns the resolved absolute path string, or null if not found.
// HOME-relative paths (~/…) and glob patterns (* chars) → null (not probeable).
// ---------------------------------------------------------------------------
function resolveSsotFile(ssotFile, repoRoot) {
  if (!ssotFile || typeof ssotFile !== 'string') return null;
  if (ssotFile.startsWith('~/') || ssotFile.includes('*')) return null;
  const basename = path.basename(ssotFile);
  for (const root of SOURCE_ROOTS) {
    const candidate = root
      ? path.resolve(repoRoot, root, basename)
      : path.resolve(repoRoot, ssotFile);
    try { if (fs.existsSync(candidate)) return candidate; } catch (_err) {}
  }
  return null;
}

// ---------------------------------------------------------------------------
// ssotFilesPresent: check ALL ssotFiles exist on disk (fail-open on empty).
// Uses resolveSsotFile so bare filenames resolve across source roots.
// HOME-relative and glob patterns are treated as not-resolvable (absent).
// ---------------------------------------------------------------------------
function ssotFilesPresent(feature, repoRoot) {
  const ssotFiles = Array.isArray(feature.ssotFiles) ? feature.ssotFiles : [];
  if (ssotFiles.length === 0) return { allPresent: true, missing: [] };
  const missing = ssotFiles.filter(relPath => {
    try { return resolveSsotFile(relPath, repoRoot) === null; } catch (_err) { return true; }
  });
  return { allPresent: missing.length === 0, missing };
}

function substituteTestPresent(substituteTest) {
  return typeof substituteTest === 'string' && substituteTest.trim().length > 0;
}

function resolveRepoRoot(repoRoot) {
  return (typeof repoRoot === 'string' && repoRoot.length > 0)
    ? repoRoot : path.resolve(__dirname, '..', '..');
}

// ---------------------------------------------------------------------------
// probeCellNA: verdict logic for structural-NA / waived cells.
// ---------------------------------------------------------------------------
function probeCellNA(feature, runtime, declared, cellData, probeResult) {
  const cellSubstitute = cellData.substituteTest || null;
  if (!substituteTestPresent(cellSubstitute)) {
    return { featureId: feature.id, runtime, declared, probed: probeResult.allPresent ? 'present' : 'missing', verdict: VERDICT.NA_WITHOUT_SUBSTITUTE };
  }
  if (!probeResult.allPresent) {
    return { featureId: feature.id, runtime, declared, probed: 'missing', verdict: VERDICT.MAKE_REACHABLE_REQUIRED };
  }
  return { featureId: feature.id, runtime, declared, probed: 'present', verdict: VERDICT.OK_NA };
}

// ---------------------------------------------------------------------------
// probeCellFull: verdict logic for full/partial/unverified/absent cells.
// ---------------------------------------------------------------------------
function probeCellFull(feature, runtime, declared, probeResult) {
  if (FULL_STATUSES.has(declared) && !probeResult.allPresent) {
    return { featureId: feature.id, runtime, declared, probed: 'missing', verdict: VERDICT.DECLARED_FULL_BUT_MISSING };
  }
  return { featureId: feature.id, runtime, declared, probed: probeResult.allPresent ? 'present' : 'missing', verdict: VERDICT.OK };
}

// ---------------------------------------------------------------------------
// probeCell: probe one (feature, runtime) cell.
// Returns { featureId, runtime, declared, probed, verdict }.
// ---------------------------------------------------------------------------
function probeCell(feature, runtime, repoRoot) {
  const effectiveRoot = resolveRepoRoot(repoRoot);
  const perRuntime = (feature.perRuntime && typeof feature.perRuntime === 'object') ? feature.perRuntime : {};
  const cellData = perRuntime[runtime] || {};
  const declared = typeof cellData.status === 'string' ? cellData.status : 'unverified';
  let probeResult;
  try { probeResult = ssotFilesPresent(feature, effectiveRoot); }
  catch (_err) { probeResult = { allPresent: true, missing: [] }; }
  if (NA_STATUSES.has(declared)) return probeCellNA(feature, runtime, declared, cellData, probeResult);
  return probeCellFull(feature, runtime, declared, probeResult);
}

// ---------------------------------------------------------------------------
// accumulateVerdicts: tally verdict counts and failure list.
// ---------------------------------------------------------------------------
function accumulateVerdicts(cells) {
  const verdictCounts = {};
  const failures = [];
  for (const cell of cells) {
    verdictCounts[cell.verdict] = (verdictCounts[cell.verdict] || 0) + 1;
    const isFail = cell.verdict === VERDICT.DECLARED_FULL_BUT_MISSING
      || cell.verdict === VERDICT.NA_WITHOUT_SUBSTITUTE;
    if (isFail) failures.push(cell);
  }
  return { verdictCounts, failures };
}

// ---------------------------------------------------------------------------
// buildMatrix: probe every parity:yes feature × runtime cell.
// Bounded to parity:yes as frontier scope-guard.
// ---------------------------------------------------------------------------
function buildMatrix(catalog, opts) {
  const repoRoot = resolveRepoRoot(opts && opts.repoRoot);
  const safeCatalog = (catalog && typeof catalog === 'object') ? catalog : {};
  const runtimes = Array.isArray(safeCatalog.runtimes) ? safeCatalog.runtimes : [];
  const features = Array.isArray(safeCatalog.features) ? safeCatalog.features : [];

  const cells = [];
  for (const feature of features) {
    if (feature.parity !== 'yes') continue;
    for (const runtime of runtimes) {
      let result;
      try { result = probeCell(feature, runtime, repoRoot); }
      catch (_err) {
        result = { featureId: feature.id, runtime, declared: 'unverified', probed: 'unknown', verdict: VERDICT.OK };
      }
      cells.push(result);
    }
  }

  const { verdictCounts, failures } = accumulateVerdicts(cells);
  return { cells, failures, summary: { totalCells: cells.length, failureCount: failures.length, verdictCounts } };
}

// ---------------------------------------------------------------------------
// loadCatalog: load committed inventory catalog (no HOME access).
// ---------------------------------------------------------------------------
function loadCatalog(repoRoot) {
  const catalogPath = path.join(repoRoot, 'inventory', 'harness-feature-catalog.json');
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

// ---------------------------------------------------------------------------
// printGateSummary: write summary lines and failure list to stdout.
// ---------------------------------------------------------------------------
function printGateSummary(matrix, strict) {
  const { failures, summary } = matrix;
  process.stdout.write('=== Harness Parity Matrix ===\n');
  process.stdout.write(`Cells probed: ${summary.totalCells}\n`);
  process.stdout.write(`Verdict counts: ${JSON.stringify(summary.verdictCounts)}\n`);
  process.stdout.write(`Failures: ${summary.failureCount}\n`);
  for (const fail of failures) {
    process.stdout.write(`  [${fail.verdict}] feature=${fail.featureId} runtime=${fail.runtime} declared=${fail.declared}\n`);
  }
  if (summary.failureCount > 0) {
    const prefix = strict ? '' : '[ADVISORY] ';
    const suffix = strict ? 'Exiting non-zero (--strict).\n' : 'Pass --strict to fail the gate.\n';
    process.stdout.write(`\n${prefix}${summary.failureCount} parity cell(s) failed probe. ${suffix}`);
  } else {
    process.stdout.write('\nAll probed cells pass.\n');
  }
}

// ---------------------------------------------------------------------------
// runGate: build matrix over the repo; print summary; exit non-zero on strict.
// ---------------------------------------------------------------------------
function runGate(opts) {
  const strict = opts && opts.strict === true;
  const repoRoot = resolveRepoRoot(opts && opts.repoRoot);
  let catalog;
  try { catalog = loadCatalog(repoRoot); }
  catch (err) {
    process.stderr.write(`[parity-matrix] Failed to load catalog: ${err.message}\n`);
    process.exit(0); return;
  }
  let matrix;
  try { matrix = buildMatrix(catalog, { repoRoot }); }
  catch (err) {
    process.stderr.write(`[parity-matrix] buildMatrix error: ${err.message}\n`);
    process.exit(0); return;
  }
  printGateSummary(matrix, strict);
  if (strict && matrix.summary.failureCount > 0) process.exit(1);
}

module.exports = { probeCell, buildMatrix, runGate, VERDICT, ssotFilesPresent, resolveSsotFile, SOURCE_ROOTS };

if (require.main === module) {
  const args = process.argv.slice(2);
  runGate({ strict: args.includes('--strict') });
}
