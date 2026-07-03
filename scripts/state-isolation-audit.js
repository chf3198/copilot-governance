#!/usr/bin/env node
'use strict';
// tier: 1
// state-isolation-audit (Epic #2091 C7 / #2108): observability for the state-isolation
// root-cause fix. Emits schema-v3 events (session-start, session-end, allowlist-decision)
// to ~/.megingjord/state-isolation.jsonl so per-session/per-worktree state lifecycle is
// auditable + attributable + queryable. Pairs with C1-C6 (per-session keying + hooks).

const os = require('node:os');
const path = require('node:path');
const { emitV3, isValidV3 } = require('./event-schema-v3');

const AUDIT_FILE = path.join(os.homedir(), '.megingjord', 'state-isolation.jsonl');
const EVENT_TYPES = ['session-start', 'session-end', 'allowlist-decision'];

function buildEvent(eventType, payload = {}, opts = {}) {
  if (!EVENT_TYPES.includes(eventType)) {
    throw new Error(`state-isolation-audit: unknown event '${eventType}' (expected ${EVENT_TYPES.join('|')})`);
  }
  const event = {
    ts: opts.ts || new Date().toISOString(),
    version: 3,
    service: 'state-isolation',
    env: opts.env || (process.env.CI ? 'ci' : 'local'),
    event: eventType,
    team: payload.team || process.env.HAMR_TEAM || 'claude-code',
    session_id: payload.session_id || opts.session_id || null,
    repo_key: payload.repo_key || null,
    state_file: payload.state_file || null,
  };
  // allowlist-decision carries the path + verdict; lifecycle events carry the prior file.
  if (eventType === 'allowlist-decision') {
    event.path = payload.path || null;
    event.decision = payload.decision || null; // 'allow' (ignored path) | 'reject' (tracked)
  } else {
    event.archived_from = payload.archived_from || null;
  }
  return event;
}

function emitStateIsolationEvent(eventType, payload = {}, opts = {}) {
  const event = buildEvent(eventType, payload, opts);
  const { ok, errors } = isValidV3(event);
  if (!ok) throw new Error(`state-isolation-audit: invalid event: ${errors.join('; ')}`);
  emitV3(event, opts.file || AUDIT_FILE);
  return event;
}

if (require.main === module) {
  const [type, json] = process.argv.slice(2);
  const payload = json ? JSON.parse(json) : {};
  console.log(JSON.stringify(emitStateIsolationEvent(type || 'session-start', payload)));
}

module.exports = { emitStateIsolationEvent, buildEvent, AUDIT_FILE, EVENT_TYPES };
