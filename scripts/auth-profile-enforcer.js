#!/usr/bin/env node
// #2910 — Authorization profile runtime enforcer (G-05, OWASP ASI02)
// Reads $MEGINGJORD_AUTH_PROFILE and returns allow/deny for a requested capability.
// Used by pretool_guard (via Python companion) and directly in JS tests.
'use strict';

const path = require('path');
const { parseActiveProfile, readSchema } = require('./authorization-profile');

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'config', 'authorization-profiles.json');

// Command patterns mapped to required capabilities
const CAPABILITY_PATTERNS = {
  install: [
    /\bnpm\s+(?:install|i|ci)\b/,
    /\bpip3?\s+install\b/,
    /\bapt(?:-get)?\s+install\b/,
    /\bbrew\s+install\b/,
    /\byarn\s+add\b/,
    /\bpnpm\s+(?:install|add)\b/,
    /\bcargo\s+install\b/,
    /\bgo\s+install\b/,
  ],
  privileged: [
    /(?:^|[\s;|&])\bsudo\b/,
    /(?:^|[\s;|&])\bsu\s+-/,
    /\bchmod\b.*\b[0-7]{3,4}\b/,
    /\bchown\b/,
  ],
  execute_remote: [
    /(?:^|[\s;|&])\bssh\b\s+\S/,
    /(?:^|[\s;|&])\bscp\b\s+\S/,
    /\brsync\b[^|&\n]*\w@[\w.]+:/,
    /(?:^|[\s;|&])\bansible(?:-playbook)?\b/,
    /(?:^|[\s;|&])\bfabric\b/,
  ],
};

/**
 * Infer which capabilities a shell command requires.
 * Returns an array of capability names (may be empty).
 */
function inferCapabilities(command) {
  const needed = [];
  for (const [cap, patterns] of Object.entries(CAPABILITY_PATTERNS)) {
    if (patterns.some(re => re.test(command))) {
      needed.push(cap);
    }
  }
  return needed;
}

/**
 * Check whether a named capability is permitted under the active profile.
 * @param {string} capability - one of install|upgrade|privileged|execute_local|execute_remote
 * @param {object} [opts] - override argv/env/schema for testing
 * @returns {{ allowed: boolean, profile: string, capability: string, reason: string }}
 */
function checkCapability(capability, opts = {}) {
  try {
    const schema = opts.schema || readSchema(SCHEMA_PATH);
    const active = parseActiveProfile({ schema, env: opts.env || process.env, argv: opts.argv || [] });
    const allowed = active.capabilities[capability] !== false;
    const reason = allowed
      ? `Profile '${active.profile}' permits '${capability}'`
      : `Profile '${active.profile}' blocks '${capability}' (G-05, ASI02)`;
    return { allowed, profile: active.profile, capability, reason };
  } catch (e) {
    // Fail-open: enforcer errors must never brick the gate
    return { allowed: true, profile: 'unknown', capability, reason: `enforcer-error: ${e.message}` };
  }
}

/**
 * Check a shell command string against the active authorization profile.
 * Returns the first deny decision found, or null if all capabilities are permitted.
 * @param {string} command - raw command string
 * @param {object} [opts] - override opts for testing
 * @returns {{ allowed: false, profile, capability, reason } | null}
 */
function checkCommand(command, opts = {}) {
  const needed = inferCapabilities(command);
  for (const cap of needed) {
    const result = checkCapability(cap, opts);
    if (!result.allowed) return result;
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const capArg = args.find(a => a.startsWith('--capability='));
  const cmdArg = args.find(a => a.startsWith('--command='));
  try {
    let result;
    if (capArg) {
      result = checkCapability(capArg.split('=')[1]);
    } else if (cmdArg) {
      result = checkCommand(cmdArg.split('=').slice(1).join('=')) || {
        allowed: true, profile: 'unknown', capability: 'none', reason: 'no restricted capability detected',
      };
    } else {
      process.stderr.write('Usage: auth-profile-enforcer.js --capability=<name>|--command=<cmd>\n');
      process.exit(2);
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.allowed ? 0 : 1);
  } catch (e) {
    process.stderr.write(`auth-profile-enforcer: ${e.message}\n`);
    process.exit(2);
  }
}

module.exports = { inferCapabilities, checkCapability, checkCommand, CAPABILITY_PATTERNS };
if (require.main === module) main();
