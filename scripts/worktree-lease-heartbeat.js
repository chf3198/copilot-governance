#!/usr/bin/env node
// worktree-lease-heartbeat (#1854 AC5) — expires stale-but-not-closed leases
// after 24h with notification to linked ticket. Designed for cron + dashboard.
'use strict';

const { read, write } = require('./cross-team-lease-registry');
const { emitLockEvent } = require('./worktree-lock-telemetry');

const STALE_THRESHOLD_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

function expiredAt(now) {
  return new Date(now - STALE_THRESHOLD_HOURS * HOUR_MS).toISOString();
}

function findStale(registry, now = Date.now()) {
  const cutoff = expiredAt(now);
  return (registry.leases || []).filter(lease => {
    if (lease.status !== 'active') return false;
    const lastSeen = lease.last_seen || lease.created_at;
    return !lastSeen || lastSeen < cutoff;
  });
}

function expireStale(registry, now = Date.now()) {
  const stale = findStale(registry, now);
  const nowIso = new Date(now).toISOString();
  for (const lease of stale) {
    lease.status = 'expired';
    lease.expired_at = nowIso;
    lease.expiry_reason = 'heartbeat-timeout';
  }
  return { expired: stale, registry };
}

function commentBlockForLease(lease) {
  return [
    '<!-- CROSS_TEAM_LEASE_EXPIRE -->',
    `## Lease auto-expired (heartbeat timeout)`,
    ``,
    `- Ticket: #${lease.ticket}`,
    `- Team: ${lease.team}`,
    `- Branch: ${lease.branch}`,
    `- Created: ${lease.created_at}`,
    `- Last seen: ${lease.last_seen || lease.created_at}`,
    `- Expired: ${lease.expired_at}`,
    `- Reason: heartbeat-timeout (>${STALE_THRESHOLD_HOURS}h since last_seen)`,
    ``,
    `Lease automatically released for reuse. To resume, run \`scripts/worktree-session-start.sh\` and re-acquire.`,
  ].join('\n');
}

function run(opts = {}) {
  const registry = opts.registry || read(opts.file);
  const result = expireStale(registry, opts.now ?? Date.now());
  if (!opts.dryRun && result.expired.length > 0) {
    write(result.registry, opts.file);
    // #1860 concern #2: best-effort observability for auto-expired leases (G8).
    for (const lease of result.expired) {
      emitLockEvent('lease_expire', { team: lease.team, ticket: lease.ticket,
        branch: lease.branch, reason: 'heartbeat-timeout' });
    }
  }
  return result;
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const result = run({ dryRun });
  process.stdout.write(JSON.stringify({
    expired_count: result.expired.length,
    expired_tickets: result.expired.map(l => l.ticket),
    dry_run: dryRun }, null, 2) + '\n');
}

module.exports = { findStale, expireStale, commentBlockForLease, run,
  STALE_THRESHOLD_HOURS };
