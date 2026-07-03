#!/usr/bin/env node
'use strict';
// Cross-team one-ticket worktree preflight (#3035 C7 AC1).
const { readJson } = require('./atomic-json-store');
const { active, DEFAULT_PATH } = require('./cross-team-lease-registry');

const ticket = Number(process.argv[2]);
const team = String(process.argv[3] || '').toLowerCase();
if (!ticket || !team) {
  process.stderr.write('usage: cross-team-worktree-preflight.js <ticket> <team>\n');
  process.exit(2);
}
const registry = readJson(process.env.CROSS_TEAM_LEASE_PATH || DEFAULT_PATH, () => ({ version: 1, leases: [] }));
const hit = active(registry).find(l => l.ticket === ticket);
if (hit && hit.team !== team) {
  process.stderr.write(`cross-team worktree collision: #${ticket} leased by ${hit.team}, not ${team}\n`);
  process.exit(1);
}
process.stdout.write(`cross-team-worktree-preflight: OK (#${ticket} ${team})\n`);
