#!/usr/bin/env node
'use strict';
// harness-catalog-reconciler.js — Epic #3411 T1.3 (#3441)
// Derives per-runtime parity cells from live committed inventory and reconciles
// against the three legacy checkers (state-store, wiki, orchestrator-governance).
// All reads are from the repo inventory — no home-dir / deployed-runtime access —
// so derivation is deterministic in CI.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const REPO_INVENTORY = path.join(ROOT, 'inventory');
const SCHEMA_ENUM = new Set([
  'full', 'partial', 'absent', 'structural-NA',
  'waived', 'advisory-backstop-exists', 'unverified',
]);

// ---------------------------------------------------------------------------
// LAYER_CAPABILITY map: each of the 19 layer prefixes maps to one or more
// capability tokens that a runtime descriptor must advertise to count as
// having "full" support for features in that layer.
// Tokens are drawn from the union of: deploy.artifactClasses, keys of
// capabilities, and the synthetic token 'hooks' (when hooks.events non-empty).
// ---------------------------------------------------------------------------
const LAYER_CAPABILITY = {
  'L1-identity-signing':                  ['signing', 'settings', 'scripts'],
  'L2-baton-contract-artifacts':          ['scripts', 'instructions'],
  'L3-hook-gate-enforcement':             ['hooks'],
  'L4-ticket-github-governance':          ['instructions', 'scripts'],
  'L5-validators-ci-workflows':           ['scripts'],
  'L6-routing-cost-hamr':                 ['scripts', 'settings'],
  'L7-knowledge-wiki-docs-memory':        ['instructions'],
  'L8-deploy-sync-registries':            ['scripts'],
  'L9-skills-agents-commands':            ['skills', 'agents'],
  'L10-observability-dashboard':          ['scripts'],
  'L11-resilience-anneal-coordination':   ['scripts', 'instructions'],
  'L12-goal-constitution-decision-lens':  ['instructions'],
  'L13-adaptive-goal-health-actuator':    ['scripts'],
  'L14-lefthook-local-pre-push-commit':   ['scripts'],
  'L15-repo-type-governance-profile':     ['scripts', 'settings'],
  'L16-edd-gate-subsystem':               ['instructions', 'scripts'],
  'L17-authorization-profile-subsystem':  ['scripts', 'settings'],
  'L18-operator-ownership-client-arbitration': ['instructions', 'scripts'],
  'L19-policy-rubric-review-ssot':        ['scripts', 'instructions'],
};

// ---------------------------------------------------------------------------
// buildCapabilitySet: derives the set of capability tokens for one runtime
// descriptor (fail-open — missing or malformed fields yield empty set).
// ---------------------------------------------------------------------------
function buildCapabilitySet(descriptor) {
  const tokens = new Set();
  if (!descriptor || typeof descriptor !== 'object') return tokens;

  const deploy = descriptor.deploy || {};
  const artifactClasses = Array.isArray(deploy.artifactClasses) ? deploy.artifactClasses : [];
  for (const cls of artifactClasses) {
    if (typeof cls === 'string') tokens.add(cls);
  }

  const capabilities = descriptor.capabilities || {};
  if (typeof capabilities === 'object' && !Array.isArray(capabilities)) {
    for (const key of Object.keys(capabilities)) tokens.add(key);
  }

  const hooks = descriptor.hooks || {};
  if (Array.isArray(hooks.events) && hooks.events.length > 0) tokens.add('hooks');

  if (descriptor.signing && typeof descriptor.signing === 'object') tokens.add('signing');

  // instructions capability: all runtimes with a deploy home inherit the repo's
  // instructions directory by design.
  if (deploy.home) tokens.add('instructions');

  return tokens;
}

// ---------------------------------------------------------------------------
// Helper: build a structural-NA cell (rule 1 — feature.parity === 'runtime-NA').
// ---------------------------------------------------------------------------
function classifyAsStructuralNA(featureId, runtime) {
  return { featureId, runtime, status: 'structural-NA', evidence: 'declared runtime-NA in catalog', source: 'catalog' };
}

// ---------------------------------------------------------------------------
// Helper: derive full/absent from capability set vs required tokens (rule 3).
// Returns a cell object or null when the descriptor cannot decide.
// ---------------------------------------------------------------------------
function classifyByDescriptor(featureId, runtime, descriptor, requiredTokens, manifestRuntimes) {
  const capSet = buildCapabilitySet(descriptor);
  const descriptorPresent = descriptor && typeof descriptor === 'object' && Object.keys(descriptor).length > 0;

  if (requiredTokens.length === 0 || !descriptorPresent) return null;

  const allCovered = requiredTokens.every(token => capSet.has(token));
  if (allCovered) {
    return { featureId, runtime, status: 'full', evidence: `descriptor covers ${requiredTokens.join(',')}`, source: 'descriptor' };
  }

  const isKnownRuntime = Array.isArray(manifestRuntimes) && manifestRuntimes.includes(runtime);
  if (!isKnownRuntime) return null;

  const missingTokens = requiredTokens.filter(token => !capSet.has(token));
  return { featureId, runtime, status: 'absent', evidence: `descriptor lacks tokens: ${missingTokens.join(',')}`, source: 'descriptor' };
}

// ---------------------------------------------------------------------------
// Helper: preserve the existing perRuntime status when descriptor cannot decide.
// ---------------------------------------------------------------------------
function preserveExistingCell(feature, runtime) {
  const existing = (feature.perRuntime || {})[runtime] || {};
  const preservedStatus = SCHEMA_ENUM.has(existing.status) ? existing.status : 'unverified';
  return { featureId: feature.id, runtime, status: preservedStatus, evidence: existing.evidence || null, source: 'preserved' };
}

// ---------------------------------------------------------------------------
// deriveOneCell: derive status for one (feature, runtime) pair.
// ---------------------------------------------------------------------------
function deriveOneCell(feature, runtime, descriptor, manifestRuntimes) {
  if (feature.parity === 'runtime-NA') return classifyAsStructuralNA(feature.id, runtime);
  if (feature.parity === 'no') return null;

  const layerKey = feature.layer || '';
  const requiredTokens = LAYER_CAPABILITY[layerKey] || [];

  let descriptorCell;
  try {
    descriptorCell = classifyByDescriptor(feature.id, runtime, descriptor, requiredTokens, manifestRuntimes);
  } catch (_err) {
    descriptorCell = null;
  }

  return descriptorCell !== null ? descriptorCell : preserveExistingCell(feature, runtime);
}

// ---------------------------------------------------------------------------
// Helper: safely fetch a descriptor from the descriptors map (fail-open).
// ---------------------------------------------------------------------------
function safeFetchDescriptor(descriptors, runtime) {
  try {
    return (descriptors && descriptors[runtime]) || null;
  } catch (_err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: derive one cell with full error isolation.
// ---------------------------------------------------------------------------
function safeDeriveCell(feature, runtime, descriptor, manifestRuntimes) {
  try {
    const cell = deriveOneCell(feature, runtime, descriptor, manifestRuntimes);
    if (cell === null) return null;
    if (!SCHEMA_ENUM.has(cell.status)) cell.status = 'unverified';
    return cell;
  } catch (_err) {
    return { featureId: feature.id, runtime, status: 'unverified', evidence: null, source: 'error' };
  }
}

// ---------------------------------------------------------------------------
// deriveCells: main export — derive all (feature, runtime) cells.
// ---------------------------------------------------------------------------
function deriveCells(catalog, { descriptors = {}, manifest = {} } = {}) {
  const runtimes = Array.isArray(catalog.runtimes) ? catalog.runtimes : [];
  const features = Array.isArray(catalog.features) ? catalog.features : [];
  const manifestRuntimes = Array.isArray(manifest.runtimes) ? manifest.runtimes : runtimes;
  const cells = [];

  for (const feature of features) {
    if (feature.parity === 'no') continue;
    for (const runtime of runtimes) {
      const descriptor = safeFetchDescriptor(descriptors, runtime);
      const cell = safeDeriveCell(feature, runtime, descriptor, manifestRuntimes);
      if (cell !== null) cells.push(cell);
    }
  }

  return cells;
}

// ---------------------------------------------------------------------------
// summarize: aggregate cell counts.
// ---------------------------------------------------------------------------
function summarize(cells) {
  const byStatus = {};
  const byRuntime = {};

  for (const cell of cells) {
    byStatus[cell.status] = (byStatus[cell.status] || 0) + 1;
    byRuntime[cell.runtime] = byRuntime[cell.runtime] || {};
    byRuntime[cell.runtime][cell.status] = (byRuntime[cell.runtime][cell.status] || 0) + 1;
  }

  return { total: cells.length, byStatus, byRuntime };
}

// ---------------------------------------------------------------------------
// loadRepoInventory: load all catalog + descriptor files from repo (no HOME).
// ---------------------------------------------------------------------------
function loadRepoInventory() {
  const catalogPath = path.join(REPO_INVENTORY, 'harness-feature-catalog.json');
  const manifestPath = path.join(REPO_INVENTORY, 'orchestrator-governance-parity.json');
  const runtimesDir = path.join(REPO_INVENTORY, 'runtimes');

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const descriptors = {};
  if (fs.existsSync(runtimesDir)) {
    for (const fname of fs.readdirSync(runtimesDir)) {
      if (!fname.endsWith('.json')) continue;
      const runtimeName = fname.replace(/\.json$/, '');
      try {
        descriptors[runtimeName] = JSON.parse(fs.readFileSync(path.join(runtimesDir, fname), 'utf8'));
      } catch (_err) {
        descriptors[runtimeName] = {};
      }
    }
  }

  return { catalog, manifest, descriptors };
}

// ---------------------------------------------------------------------------
// Helper: run all three legacy checkers, fail-open on each.
// ---------------------------------------------------------------------------
function runLegacyCheckers(manifest) {
  const stateCheck = require('./state-store-parity-check');
  const wikiCheck = require('./wiki-parity-check');
  const orchCheck = require('./orchestrator-governance-parity');

  let stateResult, wikiResult, orchResult;
  try {
    stateResult = stateCheck.run({ stateStore: manifest.stateStoreParity, runtimes: manifest.runtimes });
  } catch (_err) { stateResult = { findings: [] }; }

  try {
    const wikiParity = manifest.wikiDocsParity || {};
    wikiResult = wikiCheck.run({ digestManifest: wikiParity.digestManifest, runtimeTiers: wikiParity.runtimeTiers });
  } catch (_err) { wikiResult = { findings: [] }; }

  try {
    orchResult = orchCheck.run();
  } catch (_err) { orchResult = { findings: [] }; }

  return { stateResult, wikiResult, orchResult };
}

// ---------------------------------------------------------------------------
// Helper: collect legacy-absent keys from checker findings.
// ---------------------------------------------------------------------------
function collectLegacyFindings(stateResult, wikiResult) {
  const legacyAbsent = new Set();

  for (const finding of (stateResult.findings || [])) {
    const stateMatch = finding.id && finding.id.match(/state-store-unmapped-(.+)/);
    if (stateMatch) legacyAbsent.add(`state_store:${stateMatch[1]}`);
  }

  for (const finding of (wikiResult.findings || [])) {
    const wikiMatch = finding.id && finding.id.match(/wiki-([^-]+)-index-missing/);
    if (wikiMatch && finding.severity === 'high') legacyAbsent.add(`wiki:${wikiMatch[1]}`);
  }

  return legacyAbsent;
}

// ---------------------------------------------------------------------------
// Helper: detect conflicts between reconciler "full" cells and legacy findings.
// ---------------------------------------------------------------------------
function detectConflicts(cells, catalog, legacyAbsent) {
  const conflicts = [];
  const featureIndex = new Map((catalog.features || []).map(feat => [feat.id, feat]));

  for (const cell of cells) {
    if (cell.status !== 'full') continue;

    if (legacyAbsent.has(`state_store:${cell.runtime}`)) {
      conflicts.push({
        featureId: cell.featureId, runtime: cell.runtime,
        reconcilerStatus: 'full', legacyFindings: `state-store-unmapped-${cell.runtime}`,
        detail: 'reconciler derives full but legacy state-store checker flags runtime as unmapped',
      });
    }

    const catalogFeature = featureIndex.get(cell.featureId);
    if (catalogFeature && catalogFeature.layer === 'L7-knowledge-wiki-docs-memory') {
      if (legacyAbsent.has(`wiki:${cell.runtime}`)) {
        conflicts.push({
          featureId: cell.featureId, runtime: cell.runtime,
          reconcilerStatus: 'full', legacyFindings: `wiki-${cell.runtime}-index-missing`,
          detail: 'reconciler derives full but legacy wiki checker flags index missing',
        });
      }
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// reconcileWithLegacy: run three legacy checkers and compare vs deriveCells.
// A conflict = reconciler says "full" where a legacy checker reports unmapped/absent.
// ---------------------------------------------------------------------------
function reconcileWithLegacy(catalog, opts) {
  const { descriptors = {}, manifest = {} } = opts || {};
  const cells = deriveCells(catalog, { descriptors, manifest });

  const { stateResult, wikiResult, orchResult } = runLegacyCheckers(manifest);
  const legacyAbsent = collectLegacyFindings(stateResult, wikiResult);
  const conflicts = detectConflicts(cells, catalog, legacyAbsent);

  return {
    consistent: conflicts.length === 0,
    conflicts,
    legacySummary: {
      stateStoreFindings: (stateResult.findings || []).length,
      wikiHighFindings: (wikiResult.findings || []).filter(finding => finding.severity === 'high').length,
      orchFindings: (orchResult.findings || []).length,
    },
  };
}

module.exports = { deriveCells, summarize, reconcileWithLegacy, loadRepoInventory, LAYER_CAPABILITY, SCHEMA_ENUM };

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  const useJson = args.includes('--json');
  const strict = args.includes('--strict');

  let catalog, manifest, descriptors;
  try {
    ({ catalog, manifest, descriptors } = loadRepoInventory());
  } catch (err) {
    process.stderr.write(`[catalog-reconciler] Failed to load inventory: ${err.message}\n`);
    process.exit(1);
  }

  const cells = deriveCells(catalog, { descriptors, manifest });
  const summary = summarize(cells);

  let reconcileResult;
  try {
    reconcileResult = reconcileWithLegacy(catalog, { descriptors, manifest });
  } catch (err) {
    reconcileResult = { consistent: true, conflicts: [], error: err.message };
  }

  const output = { summary, reconcileResult };

  if (useJson) {
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } else {
    process.stdout.write('=== Harness Catalog Reconciler ===\n');
    process.stdout.write(`Total cells: ${summary.total}\n`);
    process.stdout.write(`By status: ${JSON.stringify(summary.byStatus)}\n`);
    process.stdout.write(`Legacy consistent: ${reconcileResult.consistent}\n`);
    if (!reconcileResult.consistent) {
      process.stdout.write(`Conflicts: ${JSON.stringify(reconcileResult.conflicts, null, 2)}\n`);
    }
  }

  if (strict && !reconcileResult.consistent) process.exit(1);
  process.exit(0);
}
