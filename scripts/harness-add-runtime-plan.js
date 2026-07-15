'use strict';
// harness-add-runtime-plan.js — buildPlan helpers (one action builder per surface).
// Each exported function returns one planned-action object for buildPlan() to collect.
// Descriptor action checks disk existence; all other helpers are pure (no IO).

const fs = require('node:fs');
const path = require('node:path');
const surfaces = require('./harness-add-runtime-surfaces');

// DEPLOY_SH_ALIAS maps runtime-id → the actual target token used in deploy.sh.
// Used ONLY for already-present detection on the deploy-sh surface.
// New runtimes without an alias fall back to the runtime-id (correct default).
//
// Rationale (T2.2 #3445): claude-code's deploy.sh target is "claude" not
// "claude-code". Copilot's target is "copilot" (the implicit default in the
// case-statement regex on line 17 of deploy.sh).
const DEPLOY_SH_ALIAS = {
  'claude-code': 'claude',
};

// PKG_DEPLOY_ALIAS maps runtime-id → the package.json script key suffix used
// for the deploy script. Used ONLY for already-present detection.
// New runtimes without an alias fall back to the runtime-id.
//
// Rationale (T2.2 #3445): claude-code uses "deploy:claude" not
// "deploy:claude-code". Copilot has no standalone "deploy:copilot" key —
// it is deployed via "deploy:apply" (the shared copilot+codex default target).
const PKG_DEPLOY_ALIAS = {
  'claude-code': 'claude',
  'copilot': 'apply',
};

function deployShToken(runtimeId) {
  return DEPLOY_SH_ALIAS[runtimeId] || runtimeId;
}

function pkgDeployToken(runtimeId) {
  return PKG_DEPLOY_ALIAS[runtimeId] || runtimeId;
}

function descriptorAction(runtimeId, repoRoot) {
  const filePath = path.join(repoRoot, 'inventory', 'runtimes', `${runtimeId}.json`);
  const alreadyPresent = fs.existsSync(filePath);
  return {
    surface: surfaces.SURFACE_DESCRIPTOR,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'create-file',
    detail: alreadyPresent
      ? `runtime descriptor inventory/runtimes/${runtimeId}.json already exists`
      : `Create runtime descriptor inventory/runtimes/${runtimeId}.json`,
  };
}

function githubActorMapAction(runtimeId, repoRoot, actors) {
  const filePath = path.join(repoRoot, 'inventory', 'github-actor-team-map.json');
  const actorKey = `${runtimeId}-agent`;
  const alreadyPresent = Object.values(actors || {}).includes(runtimeId);
  return {
    surface: surfaces.SURFACE_GITHUB_ACTOR_MAP,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'insert-registry-member',
    detail: alreadyPresent
      ? `team "${runtimeId}" already in actors map`
      : `Add actor "${actorKey}": "${runtimeId}" to actors`,
  };
}

function routingAdaptersAction(runtimeId, repoRoot, runtimeKinds) {
  const filePath = path.join(repoRoot, 'scripts', 'global', 'routing-provider-adapters.json');
  const alreadyPresent = (runtimeKinds || []).includes(runtimeId);
  return {
    surface: surfaces.SURFACE_ROUTING_ADAPTERS,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'insert-registry-member',
    detail: alreadyPresent
      ? `"${runtimeId}" already in runtimeKinds`
      : `Add "${runtimeId}" to runtimeKinds[]`,
  };
}

function leaderElectionAction(runtimeId, repoRoot, validTeams) {
  const filePath = path.join(repoRoot, 'scripts', 'xteam-mcp', 'leader-election.js');
  const alreadyPresent = (validTeams || []).includes(runtimeId);
  return {
    surface: surfaces.SURFACE_LEADER_ELECTION,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'insert-registry-member',
    detail: alreadyPresent
      ? `"${runtimeId}" already in VALID_TEAMS`
      : `Add "${runtimeId}" to VALID_TEAMS array`,
  };
}

function detectRuntimeAction(runtimeId, repoRoot, knownRuntimes) {
  const filePath = path.join(repoRoot, 'scripts', 'global', 'detect-runtime.js');
  const alreadyPresent = (knownRuntimes || []).includes(runtimeId);
  return {
    surface: surfaces.SURFACE_DETECT_RUNTIME,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'insert-registry-member',
    detail: alreadyPresent
      ? `"${runtimeId}" already in KNOWN + PRIMARY`
      : `Add "${runtimeId}" to KNOWN[] and PRIMARY[] with env-marker detection`,
  };
}

function teamSignaturesAction(runtimeId, repoRoot, teamValues) {
  const filePath = path.join(repoRoot, 'inventory', 'team-model-signatures.json');
  const alreadyPresent = (teamValues || []).includes(runtimeId);
  return {
    surface: surfaces.SURFACE_TEAM_SIGNATURES,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'insert-registry-member',
    detail: alreadyPresent
      ? `"${runtimeId}" already in teamValues + substrateTeamMap + autoModeCoverage`
      : `Add "${runtimeId}" to teamValues[], substrateTeamMap, autoModeCoverage`,
  };
}

function selfTestRegistryAction(runtimeId, repoRoot, adapterExemptions) {
  const filePath = path.join(repoRoot, 'inventory', 'harness-self-test-registry.json');
  const alreadyPresent = Boolean(adapterExemptions && adapterExemptions[runtimeId]);
  return {
    surface: surfaces.SURFACE_SELF_TEST_REGISTRY,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'insert-registry-member',
    detail: alreadyPresent
      ? `"${runtimeId}" already in adapter_exemptions`
      : `Add "${runtimeId}" entry to adapter_exemptions`,
  };
}

function orcParityAction(runtimeId, repoRoot, orcRuntimes) {
  const filePath = path.join(repoRoot, 'inventory', 'orchestrator-governance-parity.json');
  const alreadyPresent = (orcRuntimes || []).includes(runtimeId);
  return {
    surface: surfaces.SURFACE_ORC_PARITY,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'insert-registry-member',
    detail: alreadyPresent
      ? `"${runtimeId}" already in runtimes[] + stateStoreParity.runtimes`
      : `Add "${runtimeId}" to runtimes[] and stateStoreParity.runtimes`,
  };
}

function deployShAction(runtimeId, repoRoot, deployTargets) {
  const filePath = path.join(repoRoot, 'scripts', 'deploy.sh');
  const token = deployShToken(runtimeId);
  const alreadyPresent = (deployTargets || []).includes(token);
  const note = token !== runtimeId ? ` (via alias "${token}")` : '';
  return {
    surface: surfaces.SURFACE_DEPLOY_SH,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'add-deploy-target',
    detail: alreadyPresent
      ? `"${token}" already a deploy target in deploy.sh${note}`
      : `Add --target ${runtimeId} branch to deploy.sh and TARGET_DIRS`,
  };
}

function packageDeployAction(runtimeId, repoRoot, pkgScripts) {
  const filePath = path.join(repoRoot, 'package.json');
  const token = pkgDeployToken(runtimeId);
  const deployKey = `deploy:${token}`;
  const alreadyPresent = Boolean(pkgScripts && pkgScripts[deployKey]);
  const note = token !== runtimeId ? ` (via alias "${token}")` : '';
  return {
    surface: surfaces.SURFACE_PKG_DEPLOY,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'add-npm-script',
    detail: alreadyPresent
      ? `"${deployKey}" already in package.json scripts${note}`
      : `Add "deploy:${runtimeId}" and "deploy:${runtimeId}:apply" npm scripts`,
  };
}

function packageHarnessScriptAction(runtimeId, repoRoot, pkgScripts) {
  const filePath = path.join(repoRoot, 'package.json');
  const scriptKey = 'harness:add-runtime';
  const alreadyPresent = Boolean(pkgScripts && pkgScripts[scriptKey]);
  return {
    surface: surfaces.SURFACE_PKG_SCRIPT,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'add-npm-script',
    detail: alreadyPresent
      ? `"${scriptKey}" already in package.json scripts`
      : `Add "harness:add-runtime" npm script pointing to harness-add-runtime.js`,
    before: `Note: runtimeId=${runtimeId} — script is shared, not runtime-specific`,
  };
}

// ── T2.7 (#3450) — six new onboarding surfaces ────────────────────────────────
// Already-present detection strategy:
//   - shared-file surfaces (lefthook, governance-profiles, auth-profile, goal-tier):
//     already-present when the shared file exists — all committed runtimes qualify.
//   - instruction-set: already-present when runtime descriptor exists (descriptor
//     presence means the runtime is registered and its instruction path is trackable).
//   - config-dir: already-present when descriptor.deploy.home is non-empty.
//   This ensures all 5 committed runtimes show already-present (choice A per spec).

function lefthookAction(runtimeId, repoRoot) {
  const filePath = path.join(repoRoot, 'lefthook.yml');
  const alreadyPresent = fs.existsSync(filePath);
  return {
    surface: surfaces.SURFACE_LEFTHOOK,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'create-file',
    detail: alreadyPresent
      ? `lefthook.yml already exists — shared pre-push wiring covers ${runtimeId}`
      : `Create lefthook.yml with pre-push hook commands for ${runtimeId}`,
  };
}

function governanceProfilesAction(runtimeId, repoRoot) {
  const filePath = path.join(repoRoot, 'hooks', 'governance-profiles.json');
  const alreadyPresent = fs.existsSync(filePath);
  return {
    surface: surfaces.SURFACE_GOVERNANCE_PROFILES,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'create-file',
    detail: alreadyPresent
      ? `governance-profiles.json already exists — ${runtimeId} covered by repo-type profiles`
      : `Create hooks/governance-profiles.json with repo-type governance profiles for ${runtimeId}`,
  };
}

function instructionSetAction(runtimeId, repoRoot) {
  const descriptorPath = path.join(repoRoot, 'inventory', 'runtimes', `${runtimeId}.json`);
  const alreadyPresent = fs.existsSync(descriptorPath);
  return {
    surface: surfaces.SURFACE_INSTRUCTION_SET,
    file: path.join(repoRoot, 'inventory', 'runtimes', `${runtimeId}.json`),
    op: alreadyPresent ? 'already-present' : 'create-file',
    detail: alreadyPresent
      ? `runtime descriptor for ${runtimeId} exists — instruction-set path is tracked via deploy.home`
      : `Create runtime descriptor for ${runtimeId} and wire instruction-set path under deploy.home`,
  };
}

function authProfileAction(runtimeId, repoRoot) {
  const filePath = path.join(repoRoot, 'config', 'authorization-profiles.json');
  const alreadyPresent = fs.existsSync(filePath);
  return {
    surface: surfaces.SURFACE_AUTH_PROFILE,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'create-file',
    detail: alreadyPresent
      ? `authorization-profiles.json already exists — shared auth profile covers ${runtimeId}`
      : `Create config/authorization-profiles.json with default authorization profile for ${runtimeId}`,
  };
}

function goalTierAction(runtimeId, repoRoot) {
  const filePath = path.join(repoRoot, 'scripts', 'global', 'model-routing-policy.json');
  const alreadyPresent = fs.existsSync(filePath);
  return {
    surface: surfaces.SURFACE_GOAL_TIER,
    file: filePath,
    op: alreadyPresent ? 'already-present' : 'insert-registry-member',
    detail: alreadyPresent
      ? `model-routing-policy.json already exists — per-role lane preferences cover ${runtimeId}`
      : `Add ${runtimeId} per-role lane/goal-tier preferences to model-routing-policy.json`,
  };
}

function configDirAction(runtimeId, repoRoot, descriptorDeployHome) {
  const descriptorPath = path.join(repoRoot, 'inventory', 'runtimes', `${runtimeId}.json`);
  const alreadyPresent = Boolean(descriptorDeployHome) || fs.existsSync(descriptorPath);
  const deployHome = descriptorDeployHome || `~/.${runtimeId}`;
  return {
    surface: surfaces.SURFACE_CONFIG_DIR,
    file: descriptorPath,
    op: alreadyPresent ? 'already-present' : 'create-file',
    detail: alreadyPresent
      ? `config-dir ${deployHome} declared for ${runtimeId} via runtime descriptor`
      : `Declare config-dir path ~/.${runtimeId} in runtime descriptor for ${runtimeId}`,
  };
}

module.exports = {
  descriptorAction,
  githubActorMapAction,
  routingAdaptersAction,
  leaderElectionAction,
  detectRuntimeAction,
  teamSignaturesAction,
  selfTestRegistryAction,
  orcParityAction,
  deployShAction,
  packageDeployAction,
  packageHarnessScriptAction,
  lefthookAction,
  governanceProfilesAction,
  instructionSetAction,
  authProfileAction,
  goalTierAction,
  configDirAction,
};
