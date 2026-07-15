#!/usr/bin/env node
'use strict';
// Runtime descriptor loader/validator (Epic #3411 T1.2, #3440). Each descriptor in
// inventory/runtimes/<runtime>.json is the data-driven input from which the T2
// harness:add-runtime scaffold emits every per-runtime artifact. This module loads
// the descriptors and round-trips them against the live registries (detect-runtime.js
// env markers, deploy.sh homes, team-model-signatures.json substrateTeamMap) so a
// descriptor can never silently drift from the runtime it describes.
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIMES_DIR = path.join(REPO_ROOT, 'inventory', 'runtimes');
const DELTA_KINDS = new Set(['env-marker', 'ai-agent-value', 'state-root', 'config-path', 'adapter-surface', 'alias', 'pure', 'server-side', 'none']);
const EVENT_CASES = new Set(['PascalCase', 'camelCase', 'none']);

function listRuntimes() {
  if (!fs.existsSync(RUNTIMES_DIR)) return [];
  return fs.readdirSync(RUNTIMES_DIR).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, ''));
}

function loadDescriptor(runtime) {
  return JSON.parse(fs.readFileSync(path.join(RUNTIMES_DIR, runtime + '.json'), 'utf8'));
}

// The live env markers detect-runtime.js recognizes for a runtime (source of truth).
function liveEnvMarkers(runtime) {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'global', 'detect-runtime.js'), 'utf8');
  const line = src.split('\n').find((row) => row.includes("runtime: '" + runtime + "'"));
  if (!line) return null;
  return (line.match(/env\.([A-Z_]+)/g) || []).map((token) => token.replace('env.', ''));
}

// The live signing team for a runtime per team-model-signatures.json#substrateTeamMap.
function liveSigningTeams() {
  const reg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'inventory', 'team-model-signatures.json'), 'utf8'));
  return new Set(Object.values(reg.substrateTeamMap || {}));
}

function validateShape(descriptor, errors) {
  const where = 'descriptor "' + (descriptor.runtime || '?') + '"';
  if (!descriptor.runtime || !/^[a-z0-9-]+$/.test(descriptor.runtime)) errors.push(where + ': bad/missing runtime id');
  if (!descriptor.detection || !DELTA_KINDS.has(descriptor.detection.deltaKind)) errors.push(where + ': detection.deltaKind not in enum');
  if (descriptor.detection && descriptor.detection.deltaKind === 'ai-agent-value' && !descriptor.detection.aiAgentValue) {
    errors.push(where + ': deltaKind ai-agent-value requires detection.aiAgentValue to be set');
  }
  if (!descriptor.deploy || !descriptor.deploy.home) errors.push(where + ': deploy.home missing');
  if (!descriptor.deploy || !Array.isArray(descriptor.deploy.artifactClasses) || !descriptor.deploy.artifactClasses.length) errors.push(where + ': deploy.artifactClasses missing');
  if (!descriptor.hooks || !EVENT_CASES.has(descriptor.hooks.eventCase)) errors.push(where + ': hooks.eventCase not in enum');
  if (!descriptor.signing || !descriptor.signing.team) errors.push(where + ': signing.team missing');
  if (!descriptor.capabilities || !descriptor.capabilities.fallback) errors.push(where + ': capabilities.fallback missing');
}

// Confirm the ai-agent-value detection path is wired in detect-runtime.js KNOWN list.
// This is the positive recognition check for runtimes without a PRIMARY env marker.
function validateAiAgentValueDetection(descriptor, errors) {
  const where = 'descriptor "' + descriptor.runtime + '"';
  const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'global', 'detect-runtime.js'), 'utf8');
  const knownMatch = src.match(/const KNOWN = \[([^\]]*)\]/);
  if (!knownMatch) {
    errors.push(where + ': cannot parse KNOWN list from detect-runtime.js');
    return;
  }
  const knownRuntimes = knownMatch[1].split(',').map((entry) => entry.trim().replace(/['"]/g, '')).filter(Boolean);
  if (!knownRuntimes.includes(descriptor.runtime)) {
    errors.push(where + ': deltaKind ai-agent-value but "' + descriptor.runtime + '" absent from detect-runtime.js KNOWN list');
  }
}

// Round-trip: env markers + signing team must match the live registries, and the
// hook config path must exist on disk. A drift here is a real correctness failure.
function validateRoundTrip(descriptor, signingTeams, errors) {
  const where = 'descriptor "' + descriptor.runtime + '"';
  const declared = (descriptor.detection.primaryEnvMarkers || []).slice().sort();
  const live = liveEnvMarkers(descriptor.runtime);
  if (live) {
    const liveSorted = live.slice().sort();
    if (JSON.stringify(declared) !== JSON.stringify(liveSorted)) {
      errors.push(where + ': primaryEnvMarkers ' + JSON.stringify(declared) + ' disagree with detect-runtime.js ' + JSON.stringify(liveSorted));
    }
  } else if (descriptor.detection.deltaKind === 'env-marker') {
    errors.push(where + ': deltaKind env-marker but detect-runtime.js has no per-runtime marker line');
  } else if (descriptor.detection.deltaKind === 'ai-agent-value') {
    // ai-agent-value is a valid detection path: no PRIMARY entry is expected.
    // Confirm the runtime appears in the KNOWN list so AI_AGENT=<runtime>* is matched.
    validateAiAgentValueDetection(descriptor, errors);
  }
  if (!signingTeams.has(descriptor.signing.team)) {
    errors.push(where + ': signing.team "' + descriptor.signing.team + '" not in team-model-signatures.json#substrateTeamMap values');
  }
  const configPath = path.join(REPO_ROOT, descriptor.hooks.configPath);
  if (!fs.existsSync(configPath)) errors.push(where + ': hooks.configPath does not exist: ' + descriptor.hooks.configPath);
}

function validateAll(opts) {
  const options = opts || {};
  const errors = [];
  const runtimes = listRuntimes();
  if (!runtimes.length) errors.push('no runtime descriptors found in inventory/runtimes/');
  const signingTeams = liveSigningTeams();
  for (const runtime of runtimes) {
    let descriptor;
    try { descriptor = loadDescriptor(runtime); }
    catch (e) { errors.push('descriptor "' + runtime + '" failed to parse: ' + e.message); continue; }
    validateShape(descriptor, errors);
    if (options.roundTrip !== false) validateRoundTrip(descriptor, signingTeams, errors);
  }
  return { ok: errors.length === 0, errors, runtimes };
}

module.exports = { listRuntimes, loadDescriptor, liveEnvMarkers, liveSigningTeams, validateAll, RUNTIMES_DIR };

if (require.main === module) {
  const res = validateAll();
  if (res.ok) {
    console.log('runtime descriptors OK: ' + res.runtimes.length + ' round-tripped [' + res.runtimes.join(', ') + ']');
  } else {
    console.error('runtime descriptors INVALID (' + res.errors.length + ' errors):');
    for (const e of res.errors) console.error('  - ' + e);
  }
  process.exit(res.ok ? 0 : 1);
}
