'use strict';
// harness-add-runtime-apply.js — applyPlan helpers: transactional apply + rollback.
// Keeps all IO-mutating logic in one place, separate from pure plan builders.
// dryRun=true (default): returns plan summary, writes nothing.
// dryRun=false: applies each action atomically, rolls back all on any failure.

const fs = require('node:fs');
const path = require('node:path');

function readCurrentContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_err) {
    return null;
  }
}

function snapshotPriorContent(plan) {
  const snapshot = {};
  for (const action of plan) {
    if (action.op === 'already-present') continue;
    snapshot[action.file] = readCurrentContent(action.file);
  }
  return snapshot;
}

function restoreSnapshot(snapshot) {
  for (const [filePath, priorContent] of Object.entries(snapshot)) {
    if (priorContent === null) {
      try { fs.unlinkSync(filePath); } catch (_err) { /* file may not exist */ }
    } else {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, priorContent, 'utf8');
    }
  }
}

function applyDescriptorAction(action, runtimeId) {
  const descriptor = {
    runtime: runtimeId,
    detection: { primaryEnvMarkers: [], deltaKind: 'none' },
    signing: { team: runtimeId, substrates: [`${runtimeId}-substrate`] },
    deploy: { home: `~/.${runtimeId}`, artifactClasses: ['settings', 'hooks'] },
    hooks: { configPath: `.${runtimeId}/hooks.json`, eventCase: 'PascalCase', events: [] },
    capabilities: { ghAuth: 'unknown', hookExecution: 'unknown', fallback: 'graceful skip with advisory (G6)' },
  };
  fs.mkdirSync(path.dirname(action.file), { recursive: true });
  fs.writeFileSync(action.file, JSON.stringify(descriptor, null, 2) + '\n', 'utf8');
}

function applyJsonArrayInsert(filePath, jsonPath, value) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  let target = parsed;
  const segments = jsonPath.split('.');
  for (const segment of segments.slice(0, -1)) {
    target = target[segment];
  }
  const lastKey = segments[segments.length - 1];
  if (!Array.isArray(target[lastKey])) {
    throw new Error(`Expected array at ${jsonPath} in ${filePath}`);
  }
  if (!target[lastKey].includes(value)) {
    target[lastKey].push(value);
    target[lastKey].sort();
  }
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
}

function applyGithubActorMap(filePath, runtimeId) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const actorKey = `${runtimeId}-agent`;
  if (!Object.values(parsed.actors || {}).includes(runtimeId)) {
    parsed.actors[actorKey] = runtimeId;
  }
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
}

function applyLeaderElection(filePath, runtimeId) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const updated = raw.replace(
    /const VALID_TEAMS = \[([^\]]*)\];/,
    (match, inner) => {
      const existing = inner.split(',').map(entry => entry.trim().replace(/'/g, '').replace(/"/g, '')).filter(Boolean);
      if (existing.includes(runtimeId)) return match;
      const updated2 = [...existing, runtimeId].sort();
      return `const VALID_TEAMS = [${updated2.map(item => `'${item}'`).join(', ')}];`;
    }
  );
  fs.writeFileSync(filePath, updated, 'utf8');
}

function applyDetectRuntime(filePath, runtimeId) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const knownUpdated = raw.replace(
    /const KNOWN = \[([^\]]*)\];/,
    (match, inner) => {
      const items = inner.split(',').map(item => item.trim().replace(/'/g, '').replace(/"/g, '')).filter(Boolean);
      if (items.includes(runtimeId)) return match;
      const sorted = [...items, runtimeId].sort();
      return `const KNOWN = [${sorted.map(item => `'${item}'`).join(', ')}];`;
    }
  );
  const envMarker = `${runtimeId.toUpperCase().replace(/-/g, '_')}_AGENT`;
  const primaryEntry = `  { runtime: '${runtimeId}', test: (env) => Boolean(env.${envMarker}), signal: '${runtimeId.toUpperCase().replace(/-/g, '_')}_*' },`;
  const finalContent = knownUpdated.includes(`runtime: '${runtimeId}'`)
    ? knownUpdated
    : knownUpdated.replace(/^(const PRIMARY = \[)/m, `$1\n${primaryEntry}`);
  fs.writeFileSync(filePath, finalContent, 'utf8');
}

function applyTeamSignatures(filePath, runtimeId) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const teamValues = parsed.teamModelSpec && parsed.teamModelSpec.teamValues;
  if (teamValues && !teamValues.includes(runtimeId)) teamValues.push(runtimeId);
  if (parsed.substrateTeamMap) {
    const substrateKey = `${runtimeId}-substrate`;
    parsed.substrateTeamMap[substrateKey] = runtimeId;
  }
  if (parsed.autoModeCoverage && !parsed.autoModeCoverage[runtimeId]) {
    parsed.autoModeCoverage[runtimeId] = [];
  }
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
}

function applySelfTestRegistry(filePath, runtimeId) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.adapter_exemptions) parsed.adapter_exemptions = {};
  if (!parsed.adapter_exemptions[runtimeId]) {
    parsed.adapter_exemptions[runtimeId] = {
      exempt_checks: [],
      rationale: `${runtimeId} runtime; all stress-test checks apply`,
    };
  }
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
}

function applyOrcParity(filePath, runtimeId) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed.runtimes && !parsed.runtimes.includes(runtimeId)) {
    parsed.runtimes.push(runtimeId);
  }
  if (parsed.stateStoreParity && parsed.stateStoreParity.runtimes && !parsed.stateStoreParity.runtimes[runtimeId]) {
    parsed.stateStoreParity.runtimes[runtimeId] = {
      statePath: null,
      status: 'not-deployed',
      note: `${runtimeId} state store pending onboarding`,
    };
  }
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
}

function applyPackageJson(filePath, runtimeId, addHarnessScript) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.scripts) parsed.scripts = {};
  const deployKey = `deploy:${runtimeId}`;
  const deployApplyKey = `deploy:${runtimeId}:apply`;
  if (!parsed.scripts[deployKey]) {
    parsed.scripts[deployKey] = `bash scripts/deploy.sh --target ${runtimeId} && node scripts/global/xteam-mcp-register.js --target ${runtimeId} --root .`;
  }
  if (!parsed.scripts[deployApplyKey]) {
    parsed.scripts[deployApplyKey] = `bash scripts/deploy.sh --apply --target ${runtimeId} && node scripts/global/xteam-mcp-register.js --target ${runtimeId} --root . --apply`;
  }
  if (addHarnessScript && !parsed.scripts['harness:add-runtime']) {
    parsed.scripts['harness:add-runtime'] = 'node scripts/global/harness-add-runtime.js';
  }
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
}

function applyDeploySh(filePath, runtimeId) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.includes(`--target ${runtimeId}`)) return;
  const newBranch = [
    `if [[ "$TARGET" == "${runtimeId}" || "$TARGET" == "all" ]]; then`,
    `  $APPLY && { mkdir -p "$HOME/.${runtimeId}"; rsync -a --exclude='*.local*' "$ROOT/.${runtimeId}/" "$HOME/.${runtimeId}/" 2>/dev/null || true; echo "ok .${runtimeId}/ -> ~/.${runtimeId}/"; } || echo "(dry run) Would deploy .${runtimeId}/ -> ~/.${runtimeId}/"; [[ "$TARGET" == "${runtimeId}" ]] && exit 0; fi`,
  ].join('\n');
  const targetLine = `[[ "$TARGET" =~ ^(`;
  const updatedSh = raw.replace(
    /(\[\[ "\$TARGET" =~ \^\()([^)]+)(\))/,
    (_match, prefix, targets, suffix) => {
      const targetList = targets.split('|');
      if (!targetList.includes(runtimeId)) targetList.splice(-1, 0, runtimeId);
      return `${prefix}${targetList.join('|')}${suffix}`;
    }
  );
  const anchorPattern = /if \[\[ "\$TARGET" == "cursor"/;
  const finalSh = updatedSh.replace(anchorPattern, `${newBranch}\n\nif [[ "$TARGET" == "cursor"`);
  fs.writeFileSync(filePath, finalSh, 'utf8');
}

function applyLefthook(filePath, runtimeId) {
  // lefthook.yml is a shared file; if missing, create a minimal scaffold
  if (fs.existsSync(filePath)) return; // shared file present — no-op
  const template = [
    `# lefthook.yml — pre-push hook wiring for harness runtimes`,
    `# Generated by harness:add-runtime for runtime: ${runtimeId}`,
    `pre-push:`,
    `  parallel: true`,
    `  commands:`,
    `    lint-line-cap:`,
    `      run: npm run lint`,
    ``,
  ].join('\n');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, template, 'utf8');
}

function applyGovernanceProfiles(filePath, runtimeId) {
  if (fs.existsSync(filePath)) return; // shared file present — no-op
  const template = {
    profiles: {
      'cli-library': {
        description: `CLI tools, SDKs, and shared libraries (default for ${runtimeId})`,
        gates: {
          commit: { ticket_ref: 'deny', branch_naming: 'deny' },
          pr: { unit_tests: true, api_compat: true },
          release: { semver_check: true, changelog_required: true },
        },
        lint: {
          agnostic: ['line-limit', 'readability', 'secret-scan'],
          language: ['eslint-or-ruff'],
          project: ['api-extractor', 'type-check'],
        },
      },
    },
    fallback: 'cli-library',
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(template, null, 2) + '\n', 'utf8');
}

function applyInstructionSet(filePath, runtimeId) {
  // instruction-set is already-present when descriptor exists; no additional file to create
  if (fs.existsSync(filePath)) return;
  // Descriptor creation is handled by the runtime-descriptor surface; this is advisory-only
  const note = { _note: `instruction-set path pending: add instructions/ to ${runtimeId}.json deploy.artifactClasses` };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(note, null, 2) + '\n', 'utf8');
}

function applyAuthProfile(filePath, runtimeId) {
  if (fs.existsSync(filePath)) return; // shared file present — no-op
  const template = {
    schemaVersion: 1,
    defaultProfile: 'owner',
    profiles: {
      owner: { install: true, upgrade: true, privileged: true, execute_local: true, execute_remote: true },
      guarded: { install: false, upgrade: true, privileged: false, execute_local: true, execute_remote: true },
      restricted: { install: false, upgrade: false, privileged: false, execute_local: true, execute_remote: false },
    },
    _generated_for: runtimeId,
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(template, null, 2) + '\n', 'utf8');
}

function applyGoalTier(filePath, runtimeId) {
  if (fs.existsSync(filePath)) return; // shared policy present — no-op
  // Minimal routing policy scaffold for new runtimes missing the shared policy
  const template = {
    version: '1.0.0',
    defaultLane: 'fleet',
    per_role_lane_preferences: {
      _doc: `Per-role preferred lane for ${runtimeId}. Refs #2320.`,
      collaborator: { low: 'fleet', mid: 'fleet', high: 'haiku' },
      manager: { low: 'fleet', mid: 'haiku', high: 'premium' },
      admin: { low: 'fleet', mid: 'fleet', high: 'haiku' },
      consultant: { low: 'fleet', mid: 'haiku', high: 'premium' },
    },
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(template, null, 2) + '\n', 'utf8');
}

function applyConfigDir(filePath, runtimeId) {
  // config-dir presence is tied to the runtime descriptor; no additional file to write
  // The descriptor surface handles creation; this is a no-op advisory surface
  if (fs.existsSync(filePath)) return;
  const note = { _note: `config-dir ~/.${runtimeId} pending: declare deploy.home in runtime descriptor` };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(note, null, 2) + '\n', 'utf8');
}

function dispatchApplyAction(action, runtimeId) {
  const surf = action.surface;
  if (surf === 'runtime-descriptor') return applyDescriptorAction(action, runtimeId);
  if (surf === 'github-actor-team-map') return applyGithubActorMap(action.file, runtimeId);
  if (surf === 'routing-provider-adapters') return applyJsonArrayInsert(action.file, 'runtimeKinds', runtimeId);
  if (surf === 'leader-election') return applyLeaderElection(action.file, runtimeId);
  if (surf === 'detect-runtime') return applyDetectRuntime(action.file, runtimeId);
  if (surf === 'team-model-signatures') return applyTeamSignatures(action.file, runtimeId);
  if (surf === 'harness-self-test-registry') return applySelfTestRegistry(action.file, runtimeId);
  if (surf === 'orchestrator-governance-parity') return applyOrcParity(action.file, runtimeId);
  if (surf === 'deploy-sh') return applyDeploySh(action.file, runtimeId);
  if (surf === 'package-json-deploy') return applyPackageJson(action.file, runtimeId, false);
  if (surf === 'package-json-harness-script') return applyPackageJson(action.file, runtimeId, true);
  // T2.7 (#3450) — six new onboarding surfaces
  if (surf === 'lefthook') return applyLefthook(action.file, runtimeId);
  if (surf === 'governance-profiles') return applyGovernanceProfiles(action.file, runtimeId);
  if (surf === 'instruction-set') return applyInstructionSet(action.file, runtimeId);
  if (surf === 'auth-profile') return applyAuthProfile(action.file, runtimeId);
  if (surf === 'goal-tier') return applyGoalTier(action.file, runtimeId);
  if (surf === 'config-dir') return applyConfigDir(action.file, runtimeId);
  throw new Error(`Unknown surface in dispatchApplyAction: ${surf}`);
}

function buildDiffSummary(plan) {
  const lines = plan.map(action => {
    const status = action.op === 'already-present' ? '[no-op]' : `[${action.op}]`;
    return `  ${status} ${action.surface}: ${action.detail}`;
  });
  return lines.join('\n');
}

function applyPlan(plan, options) {
  const dryRun = options && options.dryRun !== undefined ? options.dryRun : true;
  const repoRoot = (options && options.repoRoot) || process.cwd();

  if (dryRun) {
    return { plan, diffSummary: buildDiffSummary(plan), applied: [], rolledBack: [] };
  }

  const runtimeId = plan.length > 0 ? extractRuntimeIdFromPlan(plan, repoRoot) : '';
  const priorContents = snapshotPriorContent(plan);
  const appliedActions = [];

  for (const action of plan) {
    if (action.op === 'already-present') continue;
    try {
      dispatchApplyAction(action, runtimeId);
      appliedActions.push(action.surface);
    } catch (applyErr) {
      restoreSnapshot(priorContents);
      throw Object.assign(
        new Error(`applyPlan failed on surface "${action.surface}": ${applyErr.message}; rolled back ${appliedActions.length} action(s)`),
        { rolledBack: appliedActions }
      );
    }
  }

  return { applied: appliedActions, rolledBack: [] };
}

function extractRuntimeIdFromPlan(plan, repoRoot) {
  const descriptorAction = plan.find(action => action.surface === 'runtime-descriptor');
  if (!descriptorAction) return '';
  const base = require('node:path').basename(descriptorAction.file, '.json');
  return base;
}

module.exports = { applyPlan, buildDiffSummary, snapshotPriorContent, restoreSnapshot };
