'use strict';
// baton-projects-integration (#1649) — thin wrapper invoked by baton-flow
// helpers to update Projects v2 state on role transitions. All failures
// degrade to issue-comment-only state per #1630 G6 contract.

const projects = require('./projects-v2-state.js');

async function onManagerHandoff(client, ctx, team) {
  if (projects.disabled()) return { ok: false, skipped: 'opt-out' };
  try { await projects.setClaim(client, ctx, team); return { ok: true, action: 'claim-set' }; }
  catch (error) { return { ok: false, degraded: true, error: error.message }; }
}

async function onCollaboratorHandoff(client, ctx, lockedPath) {
  if (projects.disabled()) return { ok: false, skipped: 'opt-out' };
  try { await projects.addLockedPath(client, ctx, lockedPath); return { ok: true, action: 'locked-path-set' }; }
  catch (error) { return { ok: false, degraded: true, error: error.message }; }
}

async function onConsultantCloseout(client, ctx) {
  if (projects.disabled()) return { ok: false, skipped: 'opt-out' };
  try { await projects.releaseClaim(client, ctx); return { ok: true, action: 'claim-released' }; }
  catch (error) { return { ok: false, degraded: true, error: error.message }; }
}

module.exports = { onManagerHandoff, onCollaboratorHandoff, onConsultantCloseout };
