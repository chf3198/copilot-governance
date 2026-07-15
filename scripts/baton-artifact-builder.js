#!/usr/bin/env node
'use strict';

// Schema-validated, deterministic builder for the six baton COMMENT artifacts
// (Epic #2037 P1.1, Refs #2671). buildArtifact() is PURE — identical structured
// input yields byte-identical output on any runtime (no Date/random/env reads),
// which is what the cross-runtime invariant test (P1.4 #2674) asserts. Signer is
// always DERIVED via agent-signature — never hand-typed — killing the
// signer-invention defect class. emitBuildDecision() is the separate, impure
// observability side effect so the build path stays deterministic.

const { canonicalSignerAlias } = require('./signer-alias');
const { ARTIFACT_SPECS } = require('./baton-artifact-schema');

// teamModel form: `<team>:<model>@<substrate>[/<device>]` (e.g. claude-code:opus@anthropic).
function deriveSigner(teamModel, role) {
  const [team = '', rest = ''] = String(teamModel).split(':');
  const model = (rest.split('@')[0] || '').trim();
  return canonicalSignerAlias(team, role, model);
}

function renderField(field, value) {
  return field.block ? `${field.k}:\n${value}\n\n` : `${field.k}: ${value}\n`;
}

function isEmpty(value) {
  return value === null || value === undefined || value === '';
}

// Rejects unknown keys (typo / prose-leakage guard) and missing required fields.
function assertValid(spec, name, fields) {
  const allowed = new Set(spec.fields.map((field) => field.k));
  for (const key of Object.keys(fields)) {
    if (!allowed.has(key)) throw new Error(`unknown field '${key}' for ${name}`);
  }
  for (const field of spec.fields) {
    if (field.req && isEmpty(fields[field.k])) {
      throw new Error(`missing required field '${field.k}' for ${name}`);
    }
  }
}

function buildArtifact(input = {}) {
  const { role, teamModel, ticket, fields = {} } = input;
  const name = String(input.artifact || '').toUpperCase();
  const spec = ARTIFACT_SPECS[name];
  if (!spec) throw new Error(`unknown artifact: ${name || '(none)'}`);
  if (!teamModel) throw new Error('teamModel is required');
  if (!role) throw new Error('role is required');
  assertValid(spec, name, fields);

  let body = `## ${name}\n\n`;
  if (spec.ticket && ticket) body += `ticket: #${ticket}\n\n`;
  for (const field of spec.fields) {
    const value = fields[field.k];
    if (isEmpty(value)) continue;
    body += renderField(field, value);
  }
  const signer = deriveSigner(teamModel, role);
  // Role is ALWAYS rendered as a `Role: <role>` signing line — never a bare
  // `role:` colon form in prose (which trips the closeout-schema role regex).
  body += `\nSigned-by: ${signer}\nTeam&Model: ${teamModel}\nRole: ${role}`;
  return body;
}

// Impure: appends a schema-v3 decision row. Kept OUT of buildArtifact so the
// render path is deterministic. Fire-and-forget (best-effort observability).
function emitBuildDecision(input = {}, file, now) {
  const { emitV3 } = require('./event-schema-v3');
  const event = {
    ts: now || new Date().toISOString(),
    version: 3,
    service: 'baton-artifact-builder',
    env: process.env.CI ? 'ci' : 'local',
    event: 'artifact_built',
    artifact: String(input.artifact || '').toUpperCase(),
    ticket: input.ticket ? `#${input.ticket}` : null,
    role: input.role || null,
  };
  try {
    emitV3(event, file || `${process.env.HOME}/.megingjord/baton-builds.jsonl`);
  } catch {
    // catch-empty: best-effort observability; a failed emit must never block a build.
  }
  // Epic #3425 P1-b: the post-build seam IS the review-point. Run the flaw-capture checkpoint
  // here so detected friction is surfaced for the role to dispose of in flaws_recognized:.
  // Best-effort + advisory: a failed/disabled checkpoint must never affect the build.
  let checkpoint = null;
  try {
    const { maybeRunCheckpoint } = require('./review-point-checkpoint');
    checkpoint = maybeRunCheckpoint({ role: input.role, transition: input.role,
      now: event.ts, team: input.team, runtime: input.runtime });
  } catch {
    // catch-empty: checkpoint is advisory observability; never blocks a build.
  }
  return { ...event, checkpoint };
}

module.exports = { buildArtifact, deriveSigner, emitBuildDecision };
