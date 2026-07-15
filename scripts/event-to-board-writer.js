'use strict';
// event-to-board-writer (#1665) — translate normalized event records into
// Projects v2 board state via #1648 helper. All failures degrade.

const projects = require('./projects-v2-state.js');

async function writeEventToBoard(client, ctx, event) {
  if (!event || !event.eventName) return { ok: false, reason: 'no-event' };
  if (projects.disabled()) return { ok: false, skipped: 'opt-out' };
  try {
    switch (event.eventName) {
      case 'cross-team-claim':
        await projects.setClaim(client, ctx, event.actor || 'unknown');
        return { ok: true, action: 'claim-applied' };
      case 'cross-team-release':
        await projects.releaseClaim(client, ctx);
        return { ok: true, action: 'claim-released' };
      case 'issues.labeled':
      case 'projects_v2_item.edited':
        return { ok: true, action: 'no-op', reason: 'label-or-edit-noop' };
      default:
        return { ok: false, reason: `unknown-event:${event.eventName}` };
    }
  } catch (error) {
    return { ok: false, degraded: true, error: error.message };
  }
}

module.exports = { writeEventToBoard };
