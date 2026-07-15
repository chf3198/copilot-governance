#!/usr/bin/env node
'use strict';
// credential-availability.js (#2569): a deterministic guard so the operator never asks the client for a
// secret that is already available locally. Consumes #2645's loadLocalEnv as the availability primitive.
// G1 — the client is not the credential transport layer; G4 — a local secret is never re-exposed in chat.
// All functions are value-free: they return presence/booleans + variable NAMES, never a secret value.
const { loadLocalEnv } = require('./load-local-env');

// Conservative request detection (anti-over-block, AC3): a credential NOUN and/or a known secret VAR name.
const CREDENTIAL_NOUNS =
  /\b(api[\s_-]?keys?|access[\s_-]?tokens?|secrets?|passwords?|passphrases?|client[\s_-]?secret|bearer[\s_-]?token|login\s+credentials?|credentials?)\b/i;
const KNOWN_SECRET_HINTS = /\b([A-Z][A-Z0-9_]*(?:_API_KEY|_TOKEN|_SECRET|_PASSWORD|_PAT))\b/;

/**
 * True if varName is set in the environment OR would be hydrated from the approved local `.env`.
 * Probes into a throwaway object so process.env is never mutated; never logs/returns the value.
 * @param {string} varName @param {{env?:object,path?:string}} opts @returns {boolean}
 */
function isSecretLocallyAvailable(varName, opts = {}) {
  const env = opts.env || process.env;
  if (env[varName] !== undefined && env[varName] !== '') return true;
  const probe = {};
  try { loadLocalEnv({ env: probe, quiet: true, path: opts.path }); }
  catch { return false; }
  return probe[varName] !== undefined && probe[varName] !== '';
}

/**
 * Conservatively classify whether prompt text is REQUESTING a secret (vs ordinary clarification).
 * @param {string} text @returns {{isSecretRequest:boolean, matched:?string}}
 */
function classifyCredentialRequest(text) {
  const subject = String(text || '');
  const nounMatch = subject.match(CREDENTIAL_NOUNS);
  const varMatch = subject.match(KNOWN_SECRET_HINTS);
  return {
    isSecretRequest: Boolean(nounMatch || varMatch),
    matched: (nounMatch && nounMatch[0]) || (varMatch && varMatch[0]) || null,
  };
}

/**
 * Pre-prompt guard: before asking the client for any credential, resolve local availability first.
 * absent ⇒ report the absence + use terminal-entry/approved-auth; NEVER request the raw secret in chat.
 * @param {string|string[]} varNames @returns {{available:string[], absent:string[], action:string}}
 */
function preCredentialPromptCheck(varNames, opts = {}) {
  const names = Array.isArray(varNames) ? varNames : [varNames];
  const available = names.filter((name) => isSecretLocallyAvailable(name, opts));
  const absent = names.filter((name) => !available.includes(name));
  return { available, absent, action: available.length ? 'use-local' : 'report-absent-no-prompt' };
}

module.exports = {
  isSecretLocallyAvailable, classifyCredentialRequest, preCredentialPromptCheck,
  CREDENTIAL_NOUNS, KNOWN_SECRET_HINTS,
};
