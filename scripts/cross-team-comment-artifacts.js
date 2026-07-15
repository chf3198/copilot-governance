#!/usr/bin/env node
'use strict';

const REQUIRED = {
  CLAIM_LEASE: ['ticket', 'team', 'role', 'branch', 'paths', 'expires_at'],
  CONFLICT_PULL: ['ticket', 'from_team', 'to_team', 'paths', 'requested_action'],
  TEAM_QUESTION: ['ticket', 'from_team', 'to_team', 'question', 'reply_by'],
  TEAM_RESPONSE: ['ticket', 'from_team', 'to_team', 'response_to', 'answer'],
  LEASE_CLOSE: ['ticket', 'team', 'branch', 'status'],
};

function parse(body = '') {
  const lines = body.split(/\r?\n/);
  const type = (lines.find(line => /^CROSS_TEAM_[A-Z_]+$/.test(line)) || '')
    .replace(/^CROSS_TEAM_/, '');
  const fields = {};
  for (const line of lines) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/i);
    if (match) fields[match[1].toLowerCase()] = match[2].trim();
  }
  const signedBy = body.match(/^Signed-by:\s*(.+)$/im)?.[1];
  const teamModel = body.match(/^Team&Model:\s*(.+)$/im)?.[1];
  const role = body.match(/^Role:\s*(.+)$/im)?.[1];
  return { type, fields, signedBy, teamModel, role };
}

function validate(body, activeClaims = []) {
  const artifact = parse(body);
  const errors = [];
  if (!REQUIRED[artifact.type]) errors.push('unknown artifact type');
  for (const field of REQUIRED[artifact.type] || []) {
    if (!artifact.fields[field]) errors.push(`missing ${field}`);
  }
  if (!/^#\d+$/.test(artifact.fields.ticket || '')) errors.push('missing ticket ref');
  if (!artifact.signedBy || !artifact.teamModel || !artifact.role) errors.push('missing signature');
  const duplicate = activeClaims.find(claim => claim.ticket === artifact.fields.ticket
    || (artifact.fields.branch && claim.branch === artifact.fields.branch));
  if (artifact.type === 'CLAIM_LEASE' && duplicate) errors.push('duplicate active claim');
  return { ok: errors.length === 0, errors, artifact };
}

function block(type, fields) {
  const rows = [`<!-- cross-team:${type.toLowerCase()} -->`, `CROSS_TEAM_${type}`];
  for (const [key, value] of Object.entries(fields)) rows.push(`${key}: ${value}`);
  rows.push('Signed-by: Quill Harper', 'Team&Model: codex:gpt-5.4@openai',
    'Role: collaborator');
  return rows.join('\n');
}

module.exports = { block, parse, validate, REQUIRED };
