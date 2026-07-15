#!/usr/bin/env node
'use strict';
// cross-team-lease-registry.js — canonical lease store.
// Canonical path: ~/.megingjord/cross-team-leases.json (home-dir state root,
// consistent with incidents.jsonl and other Megingjord state). Tickets #3455.
//
// Previously DEFAULT_PATH pointed at .dashboard/cross-team-leases.json (cwd-relative).
// That path was wrong: it varied by cwd and conflicted with the ~/.megingjord/ state root.
// Migration: legacyPathFor() detects a lease file at the old path and reports it.
// Read falls back to the old path when the new one is absent (backward-compat).
// Write always targets the canonical path only.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readJson, writeJsonAtomic, mutateJson } = require('./atomic-json-store');

const DEFAULT_PATH = path.join(os.homedir(), '.megingjord', 'cross-team-leases.json');
// Legacy path that was used before #3455. Kept for migration detection only.
const LEGACY_PATH = path.join(process.cwd(), '.dashboard', 'cross-team-leases.json');
const TTL_HOURS = 24;
const HOUR_MS = 3600000;

function empty() { return { version: 1, leases: [] }; }
function now() { return new Date().toISOString(); }
function expires(hours = TTL_HOURS) {
  return new Date(Date.now() + Number(hours) * HOUR_MS).toISOString();
}
function listArg(value) {
  if (!value) return [];
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Migration validator: detects a lease file at the old cwd-relative path.
 * Returns { stale: true, legacyPath, canonicalPath } when stale file found,
 * or { stale: false } when clean. Never throws.
 * @param {string} [legacyPath] - path to check; defaults to LEGACY_PATH.
 * @returns {{ stale: boolean, legacyPath?: string, canonicalPath?: string }}
 */
function checkLegacyPath(legacyPath = LEGACY_PATH) {
  if (!fs.existsSync(legacyPath)) return { stale: false };
  return {
    stale: true,
    legacyPath,
    canonicalPath: DEFAULT_PATH,
    message: `Stale cross-team lease file found at legacy path ${legacyPath}. ` +
      `Move it to ${DEFAULT_PATH} (canonical). The legacy path will not be written to.`,
  };
}

/**
 * Read lease registry. Reads from canonicalFile; falls back to legacyPath
 * when canonical is absent (backward-compat). Always writes to canonical only.
 * @param {string} [canonicalFile]
 * @returns {{ version: number, leases: Array }}
 */
function read(canonicalFile = DEFAULT_PATH) {
  if (fs.existsSync(canonicalFile)) return readJson(canonicalFile, empty);
  const legacyCheck = checkLegacyPath();
  if (legacyCheck.stale) {
    process.stderr.write(`[cross-team-lease-registry] ${legacyCheck.message}\n`);
    return readJson(legacyCheck.legacyPath, empty);
  }
  return empty();
}

/**
 * Write lease registry to the canonical path only. Never writes to legacy path.
 * @param {{ version: number, leases: Array }} registry
 * @param {string} [canonicalFile]
 */
function write(registry, canonicalFile = DEFAULT_PATH) {
  const dir = path.dirname(canonicalFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  writeJsonAtomic(registry, canonicalFile);
}
function mutateRegistry(file, mutator) {
  return mutateJson(file, mutator, empty);
}
function active(registry, at = now()) {
  return registry.leases.filter(l => l.status === 'active' && l.expires_at > at);
}
function ensureFree(registry, lease) {
  const hit = active(registry).find(l => l.ticket === lease.ticket || l.branch === lease.branch);
  if (hit) throw new Error(`active lease collision with #${hit.ticket} ${hit.branch}`);
}
function createLease(registry, input) {
  const stamp = now();
  const lease = {
    ticket: Number(input.ticket), team: input.team, role: input.role,
    branch: input.branch, worktree: input.worktree || process.cwd(),
    paths: listArg(input.paths), ports: listArg(input.ports).map(Number),
    runtime_surfaces: listArg(input.runtime_surfaces),
    created_at: stamp, last_seen: stamp, expires_at: expires(input.ttl_hours),
    status: 'active',
  };
  ensureFree(registry, lease);
  registry.leases.push(lease);
  return lease;
}
function findActive(registry, ticket) {
  return registry.leases.find(l => l.ticket === Number(ticket) && l.status === 'active');
}
function refreshLease(registry, ticket, ttlHours) {
  const lease = registry.leases.find(l => l.ticket === Number(ticket) && l.status === 'active');
  if (!lease) throw new Error(`no active lease for #${ticket}`);
  lease.last_seen = now();
  lease.expires_at = expires(ttlHours);
  return lease;
}
function expireLeases(registry, at = now()) {
  const expired = [];
  for (const lease of registry.leases) {
    if (lease.status === 'active' && lease.expires_at <= at) {
      lease.status = 'expired';
      expired.push(lease);
    }
  }
  return expired;
}
function closeLease(registry, ticket) {
  const lease = findActive(registry, ticket);
  if (!lease) throw new Error(`no active lease for #${ticket}`);
  lease.status = 'closed';
  lease.last_seen = now();
  return lease;
}
function commentBlock(event, lease) {
  const rows = [
    `<!-- cross-team-lease:${event} -->`, `CROSS_TEAM_LEASE_${event.toUpperCase()}`,
    `ticket: #${lease.ticket}`, `team: ${lease.team}`, `role: ${lease.role}`,
    `branch: ${lease.branch}`, `worktree: ${lease.worktree}`,
    `paths: ${lease.paths.join(',')}`, `ports: ${lease.ports.join(',')}`,
    `runtime_surfaces: ${lease.runtime_surfaces.join(',')}`,
    `expires_at: ${lease.expires_at}`, `status: ${lease.status}`,
  ];
  return rows.join('\n');
}
module.exports = {
  read, write, mutateRegistry, createLease, refreshLease, expireLeases,
  closeLease, active, commentBlock, checkLegacyPath, DEFAULT_PATH, LEGACY_PATH,
};
