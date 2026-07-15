'use strict';
// session-bypass-tracker.js — count governance-gate bypass-env uses per session
// Emits advisory warning when THRESHOLD reached; wired into pre-push-gates.js.
// Refs #1715

const THRESHOLD = 2;
const BYPASS_VARS = ['SKIP_CLOSEOUT_PREFLIGHT', 'PUSH_GATES_BYPASS'];

let _count = 0;

function reset() { _count = 0; }

function getCount() { return _count; }

function record(env) {
  const triggered = BYPASS_VARS.filter(v => env[v] === '1');
  if (triggered.length === 0) return { count: _count, warned: false, triggered: [] };
  _count += 1;
  const warned = _count >= THRESHOLD;
  if (warned) {
    const msg = [
      `⚠️  bypass-tracker: bypass env used ${_count} time(s) this session (${triggered.join(', ')}).`,
      `    Threshold ${THRESHOLD} reached — Tier-2 anneal triggered.`,
      `    The underlying governance-gate bug should be promoted to first-work.`,
      `    See instructions/workflow-resilience.instructions.md.`,
    ].join('\n');
    process.stderr.write(msg + '\n');
  }
  return { count: _count, warned, triggered };
}

module.exports = { record, reset, getCount, THRESHOLD, BYPASS_VARS };
