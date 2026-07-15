'use strict';
const fs = require('fs');
const path = require('path');

function loadRegistry() {
  const file = path.join(__dirname, '..', '..', 'inventory', 'team-model-signatures.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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

module.exports = { enforceSignerAlias, canonicalSignerAlias, deriveTeamFromSubstrate };
