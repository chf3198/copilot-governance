'use strict';
// worktree-lock-telemetry (#1860 concern #2) — best-effort event-schema-v3
// lifecycle telemetry for the worktree session lock. Emission is observability
// ONLY: it MUST NEVER throw and MUST NEVER block the lock result (G6 resilience).
// Default sink is the canonical ~/.megingjord/incidents.jsonl; override the path
// with MEGINGJORD_LOCK_TELEMETRY_FILE; short-circuit entirely with
// MEGINGJORD_LOCK_TELEMETRY_DISABLED=1 (used by the lock correctness specs so the
// acquire p99<50ms budget is never perturbed by telemetry IO).
const path = require('node:path');
const { emitV3 } = require('./event-schema-v3');

const SERVICE = 'worktree-session-lock';

/** Resolve the telemetry sink path (env override wins, else canonical HOME file). */
function telemetryFile() {
  if (process.env.MEGINGJORD_LOCK_TELEMETRY_FILE) return process.env.MEGINGJORD_LOCK_TELEMETRY_FILE;
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(home, '.megingjord', 'incidents.jsonl');
}

/**
 * Emit one lock-lifecycle event as a valid event-schema-v3 record. Best-effort:
 * returns false (never throws) when disabled or when the sink is unwritable.
 * @param {string} eventName  acquire | refuse | replace_stale | release | lease_expire
 * @param {object} detail     event-specific fields (team, ticket, held_by_team, ...)
 * @returns {boolean} true iff a record was durably appended.
 */
function emitLockEvent(eventName, detail = {}) {
  if (process.env.MEGINGJORD_LOCK_TELEMETRY_DISABLED === '1') return false;
  try {
    emitV3({
      version: 3,
      ts: new Date().toISOString(),
      service: SERVICE,
      env: process.env.CI ? 'ci' : 'local',
      event: `worktree.lock.${eventName}`,
      trigger_role: 'system',
      ...detail,
    }, telemetryFile());
    return true;
  } catch {
    // Best-effort observability; lock correctness must never depend on it (G6).
    return false;
  }
}

module.exports = { emitLockEvent, telemetryFile, SERVICE };
