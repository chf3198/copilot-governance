#!/usr/bin/env node
// synthesis-init — scaffolds planning/synthesis-<rdN>/ tree per protocol v3 §6.
// Refs Epic #1112 AC2 (#2403).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const TEAMS = ['cc', 'cp', 'cx', 'ag'];
const ROLE_SURNAMES = { manager: 'Mason', collaborator: 'Harper', admin: 'Reyes', consultant: 'Vale' };

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    if (argv[i]?.startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function adminTeam(rdN, adminOverride) {
  if (adminOverride) return adminOverride;
  return TEAMS[rdN % TEAMS.length];
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

function writeText(p, content) {
  fs.writeFileSync(p, content);
}

function init(rdN, adminOverride, opts = {}) {
  if (!rdN || !Number.isInteger(rdN)) {
    throw new Error('--epic <N> is required and must be an integer');
  }
  const root = opts.root || process.cwd();
  const synthDir = path.join(root, 'planning', `synthesis-${rdN}`);
  if (fs.existsSync(synthDir) && !opts.force) {
    return { synthDir, created: false, message: 'already exists; pass --force to overwrite' };
  }
  ensureDir(path.join(synthDir, 'artifacts'));
  ensureDir(path.join(synthDir, 'positions'));
  const admin = adminTeam(rdN, adminOverride);
  const kickoff = opts.now || new Date().toISOString();
  writeJson(path.join(synthDir, 'pulse.json'), {
    rdN, admin, kickoff, version: 'protocol-v3',
    teams: TEAMS, expected_artifacts: TEAMS.map(t => `${t}-rd.md`),
  });
  writeText(path.join(synthDir, 'decisions.md'), `# Decisions for synthesis-${rdN}\n\nAdmin: ${admin}\n\n<!-- D-IDs allocated by admin in submission order -->\n`);
  writeText(path.join(synthDir, 'status.md'), `# Status — synthesis-${rdN}\n\nPhase: Pre-flight\nWave: 0\nKickoff: ${kickoff}\n`);
  writeJson(path.join(synthDir, 'stability.json'), { wave_p_values: [], threshold: 0.05, consecutive_required: 3 });
  for (const team of TEAMS) {
    writeText(path.join(synthDir, 'positions', `${team}.md`), `# ${team.toUpperCase()} positions for synthesis-${rdN}\n\n<!-- append-only position log per v3 §6 -->\n`);
  }
  return { synthDir, created: true, admin };
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  try {
    const result = init(Number(args.epic), args['admin-team'], { force: args.force === 'true' });
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { init, adminTeam, TEAMS, ROLE_SURNAMES };
