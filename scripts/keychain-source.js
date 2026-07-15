#!/usr/bin/env node
'use strict';
// tier: 1
// keychain-source (#2772, Epic #2291): OPT-IN OS-keychain / `op run` credential source behind the
// canonical hydration layer. Default OFF (MEGINGJORD_KEYCHAIN unset) -> pure .env, behavior unchanged
// and no new dependency. When set to a provider, getSecret() resolves a key with precedence
//   explicit process.env export  >  keychain  >  .env  (G4: keychain is the at-rest-hardened source).
// All providers are LOCAL CLIs (offline, no network — G5/G6). Graceful: a missing/locked/erroring
// provider falls back to .env and NEVER blocks or throws. Providers are mockable via opts.exec (tests).
const { execFileSync } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 4000; // keychain CLI lookup timeout — graceful fall-through on expiry

// provider -> argv builder for "read one secret by name". Service/account namespacing via
// MEGINGJORD_KEYCHAIN_SERVICE (default "megingjord"); `op` uses an op:// reference prefix.
const PROVIDERS = {
  // macOS Keychain
  macos: (name, service) => ['security', ['find-generic-password', '-s', service, '-a', name, '-w']],
  // Linux libsecret
  libsecret: (name, service) => ['secret-tool', ['lookup', 'service', service, 'account', name]],
  // 1Password CLI: MEGINGJORD_KEYCHAIN_SERVICE holds the "op://vault/item" prefix; field = name.
  op: (name, service) => ['op', ['read', `op://${service}/${name}`]],
};

/** The configured provider name, or null when the keychain source is opt-out (default). */
function keychainProvider(env = process.env) {
  const value = (env.MEGINGJORD_KEYCHAIN || '').trim().toLowerCase();
  return PROVIDERS[value] ? value : null;
}

/**
 * Read one secret by name from the configured provider. Returns the trimmed value, or null on any
 * failure (provider unset, CLI absent, non-zero exit, timeout, empty) — graceful, never throws.
 * @param {string} name @param {{env?:object, exec?:Function, timeoutMs?:number}} opts
 * @returns {string|null}
 */
function readFromKeychain(name, opts = {}) {
  const env = opts.env || process.env;
  const provider = keychainProvider(env);
  if (!provider) return null;
  const service = env.MEGINGJORD_KEYCHAIN_SERVICE || 'megingjord';
  const [cmd, args] = PROVIDERS[provider](name, service);
  const exec = opts.exec || execFileSync;
  try {
    const out = exec(cmd, args, { encoding: 'utf8', timeout: opts.timeoutMs || DEFAULT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] });
    const value = String(out).replace(/\n$/, '');
    return value.length ? value : null;
  } catch {
    return null; // CLI absent / locked / non-zero / timeout -> fall back to .env (G6)
  }
}

/**
 * Resolve a credential with precedence: explicit-export > keychain (if configured) > .env-filled.
 * `dotenvFilled` is the set of names this process hydrated from .env (so an explicit export is
 * distinguishable and wins). Opt-in: with no provider configured this is just process.env[name].
 * @param {string} name @param {{env?:object, dotenvFilled?:Set, exec?:Function}} opts
 * @returns {string|null}
 */
function getSecret(name, opts = {}) {
  const env = opts.env || process.env;
  const filled = opts.dotenvFilled;
  const current = env[name];
  // explicit export (present AND not one we filled from .env) wins outright
  if (current !== undefined && current !== '' && !(filled && filled.has(name))) return current;
  if (keychainProvider(env)) {
    const fromKc = readFromKeychain(name, opts);
    if (fromKc) return fromKc; // keychain preferred over .env
  }
  return current !== undefined && current !== '' ? current : null; // .env fallback (or null)
}

module.exports = { keychainProvider, readFromKeychain, getSecret, PROVIDERS };

if (require.main === module) {
  const name = process.argv[2];
  const provider = keychainProvider();
  process.stdout.write(JSON.stringify({ provider, configured: !!provider, value_present: name ? !!getSecret(name) : null }) + '\n');
}
