// tier: 3
// Fleet-dev module boundary + opt-in tier-3 routing guard (#2806 P1-8 of Epic #2791; design D16). Packages
// the whole fleet-dev capability (#2802 + #2794-#2800) as a DISCRETE, OPT-IN, tier-gated HAMR module so a
// fleetless (Tier 0-2) operator carries zero fleet code and the baseline router stays byte-for-byte
// unchanged. The fleet-dev lane is offered ONLY when the module is INSTALLED (manifest present) AND ENABLED
// (opt-in env) AND the operator has EXPLICITLY asserted MEGINGJORD_MINIMUM_TIER >= 3 — an UNSET tier is
// treated as fleetless, never offered a fleet lane. FAIL-CLOSED: any uncertainty → unavailable → baseline.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { assertTier } = require('./tier-assert');

const MANIFEST_PATH = path.join(__dirname, '..', '..', 'config', 'fleet-dev-module.json');
const REQUIRED_TIER = 3;

// Own-property read only — a security/portability gate must never resolve manifest fields through a polluted
// Object.prototype (e.g. an inherited enableEnv pointing the opt-in check at the wrong variable).
const owns = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);

// Load the module manifest (never throws). null when absent/malformed → the module reads as NOT installed.
function loadManifest(manifestPath = MANIFEST_PATH) {
  try {
    const obj = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch { return null; }
}

// resolveManifest: honor an explicitly injected manifest (incl. null for "absent"), else load from disk.
function resolveManifest(opts) {
  return owns(opts, 'manifest') ? opts.manifest : loadManifest(opts.manifestPath);
}

// Installed = a manifest that names >=1 member (discrete install per the #2379 plugin precedent).
function isModuleInstalled(manifest) {
  return Boolean(owns(manifest, 'members') && Array.isArray(manifest.members) && manifest.members.length > 0);
}

// Enabled = the opt-in env flag set to an accepted value. Default OFF (fleetless-graceful). An UNSET/empty
// env value is NEVER enabled — even a manifest that (mis)configures enableValues to include '' cannot make
// the opt-in default-on, so the gate can't be weakened into enable-by-default.
function isModuleEnabled(env = process.env, manifest = null) {
  const key = (owns(manifest, 'enableEnv') && manifest.enableEnv) || 'MEGINGJORD_FLEET_DEV_ENABLED';
  const values = (owns(manifest, 'enableValues') && Array.isArray(manifest.enableValues)) ? manifest.enableValues : ['1', 'true'];
  const envValue = (env[key] || '').trim();
  if (envValue === '') return false;
  return values.includes(envValue);
}

// fleetDevAvailable(opts) -> { available, reason }. available iff installed AND enabled AND the operator has
// EXPLICITLY asserted MINIMUM_TIER >= 3 (assertTier action 'ok'; 'advisory'(unset)/'fallback'(<3) → NOT
// offered). When unavailable the caller runs the BASELINE path — there is no fleet-dev code to enter.
function fleetDevAvailable(opts = {}) {
  const env = opts.env || process.env;
  const manifest = resolveManifest(opts);
  if (!isModuleInstalled(manifest)) return { available: false, reason: 'module-not-installed' };
  if (!isModuleEnabled(env, manifest)) return { available: false, reason: 'module-disabled' };
  const tier = assertTier(REQUIRED_TIER, { env, feature: 'fleet-dev' });
  if (tier.action === 'ok') return { available: true, reason: 'enabled-tier3' };
  return { available: false, reason: tier.action === 'advisory' ? 'minimum-tier-unset' : 'below-tier-3' };
}

module.exports = {
  loadManifest, isModuleInstalled, isModuleEnabled, fleetDevAvailable, MANIFEST_PATH, REQUIRED_TIER,
};
