#!/usr/bin/env node
'use strict';
// baton-projects-sync (#1708) — workflow-invokable wrapper that calls
// baton-projects-integration when a baton artifact lands on an issue.
// Workflow trigger: issue_comment event with MANAGER_HANDOFF or
// CONSULTANT_CLOSEOUT marker.

const baton = require('./baton-projects-integration.js');

function detectArtifactType(commentBody) {
  if (typeof commentBody !== 'string') return null;
  if (commentBody.includes('MANAGER_HANDOFF')) return 'manager';
  if (commentBody.includes('CONSULTANT_CLOSEOUT')) return 'consultant';
  if (commentBody.includes('COLLABORATOR_HANDOFF')) return 'collaborator';
  return null;
}

function extractTeam(commentBody) {
  const match = (commentBody || '').match(/Team&Model:\s*([^\n]+)/i);
  if (!match) return null;
  const tm = match[1].trim();
  const colonIdx = tm.indexOf(':');
  return colonIdx > 0 ? tm.slice(0, colonIdx).trim() : null;
}

async function syncOnArtifact({ client, ctx, commentBody, lockedPath = null }) {
  const artifactType = detectArtifactType(commentBody);
  if (!artifactType) return { ok: false, reason: 'no-artifact-marker' };
  const team = extractTeam(commentBody) || 'unknown';
  try {
    if (artifactType === 'manager') return baton.onManagerHandoff(client, ctx, team);
    if (artifactType === 'collaborator') {
      return lockedPath ? baton.onCollaboratorHandoff(client, ctx, lockedPath) : { ok: true, skipped: 'no-locked-path' };
    }
    if (artifactType === 'consultant') return baton.onConsultantCloseout(client, ctx);
  } catch (error) {
    return { ok: false, degraded: true, error: error.message };
  }
  return { ok: false, reason: 'unhandled-artifact-type' };
}

module.exports = { detectArtifactType, extractTeam, syncOnArtifact };
