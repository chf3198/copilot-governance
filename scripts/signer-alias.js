'use strict';
const fs = require('fs');
const path = require('path');

// #3799-AC1 (hermetic baton tooling): resolve the team-model-signature registry so signer-alias
// runs from a clean, .git-less archive checkout. Resolution order (first existing wins):
//   1. BATON_SIGNER_REGISTRY env override (explicit path — CI / tests / operator control).
//   2. In-repo, tracked, secret-free alias subset: <repo>/inventory/team-model-signatures.json.
//   3. Legacy out-of-repo full registry: <repo>/../inventory/team-model-signatures.json (back-compat
//      with existing local dev machines that hold the cryptoKey-bearing canonical registry).
// If none resolves, throw a clear, actionable error instead of an opaque ENOENT.
const IN_REPO_REGISTRY = path.join(__dirname, '..', 'inventory', 'team-model-signatures.json');
const LEGACY_REGISTRY = path.join(__dirname, '..', '..', 'inventory', 'team-model-signatures.json');

function registryPath() {
  const env = process.env.BATON_SIGNER_REGISTRY;
  const candidates = [env, IN_REPO_REGISTRY, LEGACY_REGISTRY].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `signer-alias: no team-model-signatures registry found. Looked at ` +
      `${candidates.join(', ')}. Set BATON_SIGNER_REGISTRY or ensure the in-repo ` +
      `inventory/team-model-signatures.json is present.`,
  );
}

function loadRegistry() {
  return JSON.parse(fs.readFileSync(registryPath(), 'utf8'));
}

// AC1/AC2: derive team from substrate (primary); falls back to modelPattern team
function deriveTeamFromSubstrate(substrate, registry) {
  if (!substrate) return null;
  const map = registry.substrateTeamMap || {};
  // strip device suffix (e.g. "github-copilot/penguin-1" → "github-copilot")
  const base = String(substrate).toLowerCase().replace(/\/.*$/, '');
  return map[base] || null;
}

function aliasSeed(registry, team, model) {
  const t = (team || '').toLowerCase();
  const m = (model || '').toLowerCase();
  const match = (registry.registry || []).find(entry =>
    (entry.team === '*' || entry.team === t) && new RegExp(entry.modelPattern, 'i').test(m));
  return match?.aliasSeed || registry.defaultAliasSeed;
}

// AC3: substrate param added; substrate-first team resolution; backwards compatible
function canonicalSignerAlias(teamName, role, model, registry = loadRegistry(), substrate = '') {
  const effectiveTeam = deriveTeamFromSubstrate(substrate, registry) || (teamName || '').toLowerCase();
  const roleKey = (role || 'collaborator').toLowerCase();
  const seed = aliasSeed(registry, effectiveTeam, model);
  const surname = registry.roleSurnames?.[roleKey] || registry.roleSurnames?.collaborator || 'Harper';
  return `${seed} ${surname}`;
}

function enforceSignerAlias(teamName, role, input, opts = {}) {
  const registry = opts.registry || loadRegistry();
  const canonical = canonicalSignerAlias(teamName, role, opts.model || '', registry, opts.substrate || '');
  const provided = String(input || '').trim();
  if (!provided) return { ok: false, canonical, reason: 'missing-signed-by' };
  const ok = provided.toLowerCase() === canonical.toLowerCase();
  return { ok, canonical, provided, reason: ok ? 'match' : 'mismatch' };
}

module.exports = {
  enforceSignerAlias,
  canonicalSignerAlias,
  deriveTeamFromSubstrate,
  loadRegistry,
  registryPath,
  IN_REPO_REGISTRY,
  LEGACY_REGISTRY,
};
