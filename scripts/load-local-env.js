#!/usr/bin/env node
'use strict';
// tier: 1
// load-local-env.js (#2645): hydrate process.env from the repo-root `.env` so zero-cost review and
// provider dispatch (fleet + free-cloud) find keys with NO manual `set -a; . ./.env` step. G3 enabler.
// Contract: fill-don't-override (G2 precedence), never logs values (G4), graceful on missing/malformed
// (G5/G6), one redaction-safe audit line of NAMES only (G8), env-based so all runtimes share it (G9).
const fs = require('node:fs');
const path = require('node:path');

let redactString;
try { ({ redactString } = require('./log-redaction')); }
catch { redactString = (text) => ({ text }); } // redactString returns { text, hits }

// Repo root is two levels up from scripts/global/.
const DEFAULT_ENV_PATH = path.resolve(__dirname, '..', '..', '.env');

let hydratedOnce = false;
const dotenvFilled = new Set(); // names this process hydrated from .env (vs explicit export) for keychain precedence

/**
 * Parse `.env` text into ordered [name, value] pairs.
 * Skips blank lines, comments, and malformed entries; strips an optional `export ` and surrounding quotes.
 * @param {string} text raw file contents @returns {Array<[string,string]>}
 */
function parseEnv(text) {
  const pairs = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const body = line.startsWith('export ') ? line.slice(7).trim() : line;
    const splitAt = body.indexOf('=');
    if (splitAt <= 0) continue; // no key, or leading '=' — malformed, skip
    const name = body.slice(0, splitAt).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue; // not a shell identifier — skip
    let value = body.slice(splitAt + 1).trim();
    const quoted = value.length >= 2 &&
      ((value[0] === '"' && value.endsWith('"')) || (value[0] === "'" && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);
    pairs.push([name, value]);
  }
  return pairs;
}

/**
 * Fill only the keys absent from targetEnv (never override an explicit/CI value).
 * @param {object} targetEnv @param {Array<[string,string]>} pairs @returns {string[]} names filled
 */
function hydrate(targetEnv, pairs) {
  const filled = [];
  for (const [name, value] of pairs) {
    if (targetEnv[name] === undefined) { targetEnv[name] = value; filled.push(name); }
  }
  return filled;
}

/**
 * Load the repo-root `.env` into process.env. Fill-don't-override; redaction-safe; never throws.
 * @param {{env?:object,path?:string,quiet?:boolean}} opts @returns {{filled:string[],skipped:?string}}
 */
function loadLocalEnv(opts = {}) {
  const targetEnv = opts.env || process.env;
  if (targetEnv.MEGINGJORD_NO_DOTENV === '1') return { filled: [], skipped: 'disabled' };
  const envPath = opts.path || targetEnv.MEGINGJORD_DOTENV_PATH || DEFAULT_ENV_PATH;
  let text;
  try { text = fs.readFileSync(envPath, 'utf8'); }
  catch { return { filled: [], skipped: 'missing' }; } // G5/G6: no file -> pass-through to real env
  let filled = [];
  try { filled = hydrate(targetEnv, parseEnv(text)); }
  catch { return { filled: [], skipped: 'parse-error' }; } // never throw into the dispatch path
  if (filled.length && !opts.quiet) {
    const auditLine = `env-hydrate: filled=[${filled.join(',')}] count=${filled.length} source=.env`;
    process.stderr.write(`${redactString(auditLine).text}\n`); // NAMES only, value-free + redaction-safe
  }
  return { filled, skipped: null };
}

/**
 * Idempotent once-per-process hydration of the real process.env, for hot dispatch paths.
 * @returns {{filled:string[],skipped:?string}}
 */
function loadLocalEnvOnce() {
  if (hydratedOnce) return { filled: [], skipped: 'cached' };
  hydratedOnce = true;
  const report = loadLocalEnv();
  report.filled.forEach((name) => dotenvFilled.add(name)); // track filled names for keychain precedence
  return report;
}

/**
 * Keychain-aware credential resolver (#2772): explicit-export > opt-in keychain > .env. Default
 * (no MEGINGJORD_KEYCHAIN) returns the .env/process.env value, so behavior is unchanged. Graceful.
 * @param {string} name @param {object} [opts] @returns {string|null}
 */
function getCredential(name, opts = {}) {
  loadLocalEnvOnce();
  try {
    const { getSecret } = require('./keychain-source');
    return getSecret(name, { dotenvFilled, ...opts });
  } catch {
    const value = (opts.env || process.env)[name];
    return value !== undefined && value !== '' ? value : null; // keychain module issue -> .env
  }
}

/**
 * Typed error for a declared-required credential that is absent after hydration (#2769 AC5).
 * Carries the absent key names. Its presence signals fail-closed: callers MUST surface the
 * absence (terminal entry / approved auth) and MUST NOT prompt the client for the raw secret (G1/G4).
 */
class CredentialAbsentError extends Error {
  constructor(absent) {
    super(`required credential(s) absent after hydration: [${absent.join(',')}] — `
      + 'resolve via terminal entry or approved auth; never prompt the client (G1/G4)');
    this.name = 'CredentialAbsentError';
    this.absent = absent;
    this.code = 'CREDENTIAL_ABSENT';
  }
}

/**
 * Hydrate (once) then assert that every declared-required key is present — fail-closed (#2769 AC5).
 * Optional keys are NOT checked here; they degrade silently. Never prompts the client; on a missing
 * required key it throws CredentialAbsentError (or returns the report when opts.throwOnAbsent===false).
 * Shares the availability semantics of credential-availability.js#preCredentialPromptCheck without a
 * circular dependency (this is the lower layer).
 * @param {string|string[]} requiredKeys @param {{env?:object,throwOnAbsent?:boolean}} opts
 * @returns {{ok:boolean, absent:string[]}}
 */
function requireKeys(requiredKeys, opts = {}) {
  loadLocalEnvOnce();
  const env = opts.env || process.env;
  const names = Array.isArray(requiredKeys) ? requiredKeys : [requiredKeys];
  // A key absent from env may still resolve from an opt-in keychain (#2772) before we fail-closed.
  const absent = names.filter((name) => {
    if (env[name] !== undefined && env[name] !== '') return false;
    return !getCredential(name, { env });
  });
  if (absent.length && opts.throwOnAbsent !== false) throw new CredentialAbsentError(absent);
  return { ok: absent.length === 0, absent };
}

module.exports = {
  loadLocalEnv, loadLocalEnvOnce, requireKeys, getCredential, CredentialAbsentError,
  parseEnv, hydrate, DEFAULT_ENV_PATH,
};

if (require.main === module) loadLocalEnv();
