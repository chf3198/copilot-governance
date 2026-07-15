#!/usr/bin/env node
'use strict';
const { canonicalSignerAlias } = require('./signer-alias');
const { buildArtifact } = require('./baton-artifact-builder');

// AC1 (#2693): fail loud on unrecognized flags so stale callers surface errors.
const KNOWN_FLAGS = new Set([
  'artifact', 'role', 'team-model', 'ticket', 'fields-json',
  'summary', 'related-tickets', 'overlap-decision',
]);
function checkUnknownFlags() {
  for (const token of process.argv.slice(2)) {
    const m = token.match(/^--(.+)/);
    if (m && !KNOWN_FLAGS.has(m[1])) {
      const known = [...KNOWN_FLAGS].map((f) => `--${f}`).join(', ');
      process.stderr.write(`error: unknown flag '--${m[1]}'. Recognized: ${known}\n`);
      process.exit(1);
    }
  }
}

// AC2 (#2693): MANAGER_HANDOFF legacy output must contain all routing fields.
const MH_REQUIRED = ['scope', 'lane', 'test_strategy', 'acceptance', 'gates'];
function checkLegacyOutput(artifact, output) {
  if (artifact !== 'MANAGER_HANDOFF') return;
  for (const field of MH_REQUIRED) {
    if (!new RegExp(`(?:^|\\n)${field}\\s*:`).test(output)) {
      process.stderr.write(`error: MANAGER_HANDOFF missing required field '${field}' in legacy output\n`);
      process.exit(1);
    }
  }
}

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] || '') : fallback;
}

function buildBatonComment({ artifact, ticket, role, teamModel, summary = '', relatedTickets = '', overlapDecision = '' }) {
  const [team = '', modelSub = ''] = String(teamModel || '').split(':');
  const model = (modelSub.split('@')[0] || '').trim();
  const signer = canonicalSignerAlias(team, role, model);
  const head = `## ${artifact}\n\n`;
  const scope = summary ? `scope: ${summary}\n\n` : '';
  const refs = ticket ? `ticket: #${ticket}\n\n` : '';
  const overlap = artifact === 'MANAGER_HANDOFF' && role === 'manager'
    ? `${relatedTickets ? `related_tickets: ${relatedTickets}\n` : ''}${overlapDecision ? `overlap_decision: ${overlapDecision}\n` : ''}${relatedTickets || overlapDecision ? '\n' : ''}`
    : '';
  const sig = `Signed-by: ${signer}\nTeam&Model: ${teamModel}\nRole: ${role}`;
  return `${head}${scope}${refs}${overlap}${sig}`;
}

function main() {
  checkUnknownFlags();
  const artifact = arg('artifact', 'MANAGER_HANDOFF').toUpperCase();
  const role = arg('role', 'manager').toLowerCase();
  const teamModel = arg('team-model', process.env.TEAM_MODEL || '');
  const ticket = arg('ticket', '');
  if (!teamModel) {
    process.stderr.write('Missing --team-model (or TEAM_MODEL env).\n');
    process.exit(1);
  }
  // Structured path (P1.1 #2671): `--fields-json <file>` delegates to the
  // schema-validated deterministic builder. Default path stays the legacy
  // free-form renderer for back-compat (AC5).
  const fieldsJson = arg('fields-json', '');
  if (fieldsJson) {
    const fields = JSON.parse(require('fs').readFileSync(fieldsJson, 'utf8'));
    console.log(buildArtifact({ artifact, role, teamModel, ticket, fields }));
    return;
  }
  const summary = arg('summary', '');
  const relatedTickets = arg('related-tickets', '');
  const overlapDecision = arg('overlap-decision', '');
  const out = buildBatonComment({ artifact, ticket, role, teamModel, summary, relatedTickets, overlapDecision });
  checkLegacyOutput(artifact, out);
  console.log(out);
}

if (require.main === module) main();
module.exports = { buildBatonComment, buildArtifact };
