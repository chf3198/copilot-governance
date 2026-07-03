#!/usr/bin/env node
'use strict';
// harness-add-runtime.js — deterministic scaffold generator for new harness runtimes.
// Dry-run is the default (safety). Emits every per-runtime onboarding artifact from the
// catalog + registry membership pattern of existing runtimes (cursor used as reference).
// Split into helper modules to keep every function ≤30 lines and naming readable.
//
// Usage: node scripts/global/harness-add-runtime.js --runtime <id> [--dry-run|--apply] [--json]
// npm:  npm run harness:add-runtime -- --runtime <id>

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const surfaces = require('./harness-add-runtime-surfaces');
const planBuilders = require('./harness-add-runtime-plan');
const { applyPlan } = require('./harness-add-runtime-apply');

const KNOWN_RUNTIMES_FROM_DESCRIPTORS = ['antigravity', 'claude-code', 'codex', 'copilot', 'cursor'];

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadLeaderElectionTeams(repoRoot) {
  const filePath = path.join(repoRoot, 'scripts', 'xteam-mcp', 'leader-election.js');
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = raw.match(/const VALID_TEAMS = \[([^\]]*)\]/);
  if (!match) return [];
  return match[1].split(',').map(item => item.trim().replace(/['"]/g, '')).filter(Boolean);
}

function loadDetectRuntimeKnown(repoRoot) {
  const filePath = path.join(repoRoot, 'scripts', 'global', 'detect-runtime.js');
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = raw.match(/const KNOWN = \[([^\]]*)\]/);
  if (!match) return [];
  return match[1].split(',').map(item => item.trim().replace(/['"]/g, '')).filter(Boolean);
}

function loadDeployShTargets(repoRoot) {
  const filePath = path.join(repoRoot, 'scripts', 'deploy.sh');
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = raw.match(/\^\(([^)]+)\)/);
  if (!match) return [];
  return match[1].split('|').map(item => item.trim()).filter(Boolean);
}

function loadRegistryContext(repoRoot) {
  const actorMap = loadJson(path.join(repoRoot, 'inventory', 'github-actor-team-map.json'));
  const routingAdapters = loadJson(path.join(repoRoot, 'scripts', 'global', 'routing-provider-adapters.json'));
  const signatures = loadJson(path.join(repoRoot, 'inventory', 'team-model-signatures.json'));
  const selfTest = loadJson(path.join(repoRoot, 'inventory', 'harness-self-test-registry.json'));
  const orcParity = loadJson(path.join(repoRoot, 'inventory', 'orchestrator-governance-parity.json'));
  const pkgJson = loadJson(path.join(repoRoot, 'package.json'));
  return { actorMap, routingAdapters, signatures, selfTest, orcParity, pkgJson };
}

function loadDescriptorDeployHome(runtimeId, repoRoot) {
  const descriptorPath = path.join(repoRoot, 'inventory', 'runtimes', `${runtimeId}.json`);
  if (!fs.existsSync(descriptorPath)) return null;
  try {
    const descriptor = loadJson(descriptorPath);
    return (descriptor.deploy && descriptor.deploy.home) || null;
  } catch (_err) {
    return null;
  }
}

// buildExtendedSurfaceActions builds the T2.7 (#3450) six new onboarding surface actions.
// Extracted to keep buildAllActions within the 30-line readability limit.
function buildExtendedSurfaceActions(runtimeId, repoRoot) {
  const deployHome = loadDescriptorDeployHome(runtimeId, repoRoot);
  return [
    planBuilders.lefthookAction(runtimeId, repoRoot),
    planBuilders.governanceProfilesAction(runtimeId, repoRoot),
    planBuilders.instructionSetAction(runtimeId, repoRoot),
    planBuilders.authProfileAction(runtimeId, repoRoot),
    planBuilders.goalTierAction(runtimeId, repoRoot),
    planBuilders.configDirAction(runtimeId, repoRoot, deployHome),
  ];
}

function buildAllActions(runtimeId, repoRoot, registryCtx) {
  const {
    actorMap, routingAdapters, signatures, selfTest, orcParity, pkgJson,
  } = registryCtx;

  const leaderTeams = loadLeaderElectionTeams(repoRoot);
  const knownRuntimes = loadDetectRuntimeKnown(repoRoot);
  const deployTargets = loadDeployShTargets(repoRoot);

  const coreActions = [
    planBuilders.descriptorAction(runtimeId, repoRoot),
    planBuilders.githubActorMapAction(runtimeId, repoRoot, actorMap.actors),
    planBuilders.routingAdaptersAction(runtimeId, repoRoot, routingAdapters.runtimeKinds),
    planBuilders.leaderElectionAction(runtimeId, repoRoot, leaderTeams),
    planBuilders.detectRuntimeAction(runtimeId, repoRoot, knownRuntimes),
    planBuilders.teamSignaturesAction(runtimeId, repoRoot, signatures.teamModelSpec && signatures.teamModelSpec.teamValues),
    planBuilders.selfTestRegistryAction(runtimeId, repoRoot, selfTest.adapter_exemptions),
    planBuilders.orcParityAction(runtimeId, repoRoot, orcParity.runtimes),
    planBuilders.deployShAction(runtimeId, repoRoot, deployTargets),
    planBuilders.packageDeployAction(runtimeId, repoRoot, pkgJson.scripts),
    planBuilders.packageHarnessScriptAction(runtimeId, repoRoot, pkgJson.scripts),
  ];
  return [...coreActions, ...buildExtendedSurfaceActions(runtimeId, repoRoot)];
}

function sortPlanBySurface(actions) {
  const surfaceOrder = surfaces.SURFACE_ORDER;
  return [...actions].sort((actionA, actionB) => {
    const indexA = surfaceOrder.indexOf(actionA.surface);
    const indexB = surfaceOrder.indexOf(actionB.surface);
    if (indexA !== indexB) return indexA - indexB;
    return actionA.file.localeCompare(actionB.file);
  });
}

function buildPlan(runtimeId, options) {
  const repoRoot = (options && options.repoRoot) || process.cwd();
  const registryCtx = loadRegistryContext(repoRoot);
  const actions = buildAllActions(runtimeId, repoRoot, registryCtx);
  return sortPlanBySurface(actions);
}

function canonicalizePlan(plan) {
  return plan.map(action => ({
    surface: action.surface,
    file: action.file,
    op: action.op,
    detail: action.detail,
  }));
}

function planHash(plan) {
  const seed = process.env.HARNESS_SCAFFOLD_SEED || '';
  const canonical = JSON.stringify(canonicalizePlan(plan));
  return crypto.createHash('sha256').update(seed + canonical).digest('hex');
}

function loadDescriptor(runtimeId, repoRoot) {
  const descriptorPath = path.join(repoRoot, 'inventory', 'runtimes', `${runtimeId}.json`);
  if (!fs.existsSync(descriptorPath)) return null;
  return loadJson(descriptorPath);
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  let runtimeId = null;
  let dryRun = true;
  let outputJson = false;

  for (let idx = 0; idx < args.length; idx++) {
    if (args[idx] === '--runtime') { runtimeId = args[++idx]; continue; }
    if (args[idx] === '--dry-run') { dryRun = true; continue; }
    if (args[idx] === '--apply') { dryRun = false; continue; }
    if (args[idx] === '--json') { outputJson = true; continue; }
  }
  return { runtimeId, dryRun, outputJson };
}

function printPlanDryRun(plan, outputJson) {
  if (outputJson) {
    console.log(JSON.stringify({ dryRun: true, plan }, null, 2));
    return;
  }
  console.log('harness:add-runtime — DRY RUN (pass --apply to execute)');
  for (const action of plan) {
    const status = action.op === 'already-present' ? '[no-op]' : `[${action.op}]`;
    console.log(`  ${status} ${action.surface}: ${action.detail}`);
  }
  const pendingCount = plan.filter(action => action.op !== 'already-present').length;
  console.log(`\n${pendingCount} action(s) pending, ${plan.length - pendingCount} already-present.`);
}

function warnIfNoDescriptor(runtimeId, resolvedRoot) {
  const descriptor = loadDescriptor(runtimeId, resolvedRoot);
  if (!descriptor && !KNOWN_RUNTIMES_FROM_DESCRIPTORS.includes(runtimeId)) {
    console.error(`Warning: no descriptor found for "${runtimeId}" — a scaffold descriptor will be created`);
  }
}

function runCliDryRun(plan, hashValue, outputJson) {
  printPlanDryRun(plan, outputJson);
  if (!outputJson) console.log(`\nPlan hash: ${hashValue}`);
}

function runCliApply(plan, resolvedRoot, hashValue, outputJson) {
  try {
    const result = applyPlan(plan, { repoRoot: resolvedRoot, dryRun: false });
    if (outputJson) {
      console.log(JSON.stringify({ applied: result.applied, rolledBack: result.rolledBack, hash: hashValue }, null, 2));
    } else {
      console.log(`Applied ${result.applied.length} action(s): ${result.applied.join(', ')}`);
    }
  } catch (applyErr) {
    console.error(`Error: ${applyErr.message}`);
    process.exit(1);
  }
}

function runCli(argv, repoRoot) {
  const { runtimeId, dryRun, outputJson } = parseCliArgs(argv);
  if (!runtimeId) {
    console.error('Error: --runtime <id> is required');
    process.exit(1);
  }
  const resolvedRoot = repoRoot || path.resolve(__dirname, '..', '..');
  if (!dryRun) warnIfNoDescriptor(runtimeId, resolvedRoot);
  const plan = buildPlan(runtimeId, { repoRoot: resolvedRoot });
  const hashValue = planHash(plan);
  if (dryRun) {
    runCliDryRun(plan, hashValue, outputJson);
  } else {
    runCliApply(plan, resolvedRoot, hashValue, outputJson);
  }
}

if (require.main === module) {
  runCli(process.argv, null);
}

module.exports = { buildPlan, applyPlan, planHash };
