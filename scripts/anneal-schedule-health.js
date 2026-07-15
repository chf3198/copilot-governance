#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const TWO = Number('2');

function actorHealth(actor, eventName) {
  const base = { actor: actor || 'unknown', event: eventName || 'unknown', status: 'ok', guidance: null };
  if (eventName !== 'schedule') return { ...base, status: 'skip' };
  if (!actor) return { ...base, status: 'warn', guidance: 'Missing GITHUB_ACTOR for scheduled run.' };
  try {
    const raw = execFileSync('gh', ['api', `/users/${actor}`], { encoding: 'utf8' });
    const user = JSON.parse(raw);
    const isBot = String(user.type || '').toLowerCase() === 'bot';
    return isBot ? { ...base, status: 'warn', guidance: 'Schedule actor is bot; validate owner continuity.' } : base;
  } catch {
    return { ...base, status: 'warn', guidance: 'Schedule actor lookup failed; verify actor is active and repo access persists.' };
  }
}

function main(env = process.env) {
  const report = actorHealth(env.GITHUB_ACTOR, env.GITHUB_EVENT_NAME);
  process.stdout.write(JSON.stringify(report, null, TWO) + '\n');
}

if (require.main === module) main();
module.exports = { actorHealth, main };
