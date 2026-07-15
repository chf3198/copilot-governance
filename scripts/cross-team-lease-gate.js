#!/usr/bin/env node
'use strict';
// Pre-push cross-team lease gate (#2916 / #3033 C5 AC2).
const { execFileSync } = require('child_process');
const path = require('path');
const { readJson } = require('./atomic-json-store');
const { active, DEFAULT_PATH } = require('./cross-team-lease-registry');

const LEASE_PATH = process.env.CROSS_TEAM_LEASE_PATH || DEFAULT_PATH;
const GUARDED = ['scripts/global/', 'hooks/scripts/', 'inventory/', 'config/'];

function stagedFiles() {
  const out = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' });
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

function touchesGuarded(files) {
  return files.some(f => GUARDED.some(p => f.startsWith(p) || f.includes(`/${p}`)));
}

function ticketFromBranch(branch) {
  const m = String(branch || '').match(/(?:feat|fix)\/(\d+)/);
  return m ? Number(m[1]) : null;
}

function main() {
  if (process.env.MEGINGJORD_IT_OPS === '1' || process.env.CROSS_TEAM_LEASE_SKIP === '1') {
    process.stdout.write('cross-team-lease-gate: skipped (env bypass)\n');
    return 0;
  }
  const files = stagedFiles();
  if (!touchesGuarded(files)) return 0;
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  const ticket = ticketFromBranch(branch);
  if (!ticket) {
    process.stderr.write('cross-team-lease-gate: guarded paths staged but branch has no ticket id\n');
    return 1;
  }
  const team = (process.env.HAMR_TEAM || process.env.MEGINGJORD_TEAM || '').toLowerCase();
  const registry = readJson(LEASE_PATH, () => ({ version: 1, leases: [] }));
  const hit = active(registry).find(l => l.ticket === ticket);
  if (!hit) {
    process.stderr.write(`cross-team-lease-gate: no active lease for #${ticket} on guarded paths\n`);
    return 1;
  }
  if (team && hit.team !== team) {
    process.stderr.write(`cross-team-lease-gate: lease team=${hit.team} != pusher team=${team}\n`);
    return 1;
  }
  process.stdout.write(`cross-team-lease-gate: OK (#${ticket} leased by ${hit.team})\n`);
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { touchesGuarded, ticketFromBranch, main };
