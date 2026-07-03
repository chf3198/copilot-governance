#!/usr/bin/env node
'use strict';
// AC5: validate substrate-team consistency in team:model@substrate strings.
// Usage: node lint-team-signature.js --team-model "copilot:gpt-5.4-mini@github-copilot"
//        Reads stdin newline-separated list if no --team-model arg provided.
const { deriveTeamFromSubstrate } = require('./signer-alias');
const registry = JSON.parse(require('fs').readFileSync(
  require('path').join(__dirname, '..', '..', 'inventory', 'team-model-signatures.json'), 'utf8'));

const RE = /^([\w-]+):([\w.\-]+)@([\w-]+)/;

function check(teamModel) {
  const m = RE.exec((teamModel || '').trim());
  if (!m) return { ok: false, input: teamModel, reason: 'unparseable' };
  const [, team, , substrate] = m;
  const mapped = deriveTeamFromSubstrate(substrate, registry);
  if (!mapped) return { ok: true, input: teamModel, reason: 'substrate-unmapped' };
  const ok = mapped === team.toLowerCase();
  return { ok, input: teamModel, mapped, declared: team, reason: ok ? 'match' : 'mismatch' };
}

const args = process.argv.slice(2);
const idx = args.indexOf('--team-model');
const inputs = idx >= 0 ? [args[idx + 1]] :
  require('fs').readFileSync('/dev/stdin', 'utf8').split('\n').filter(Boolean);

let exitCode = 0;
for (const input of inputs) {
  const r = check(input);
  if (!r.ok && r.reason !== 'substrate-unmapped') {
    console.error(`FAIL: "${r.input}" — declared team "${r.declared}" but substrate maps to "${r.mapped}"`);
    exitCode = 1;
  } else {
    console.log(`OK: "${r.input}" (${r.reason})`);
  }
}
process.exit(exitCode);
