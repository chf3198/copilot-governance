#!/usr/bin/env node
'use strict';
// epic-task-list-auto-tick.js — when a child issue closes, tick the
// matching `- [ ] #N <sep>` task-list line on any open Epic body that
// references it. Pure functions; CLI optional. Refs #1337.

const CHILD_REF_UNTICKED = (n) => new RegExp(
  `^(- \\[ \\])(\\s*#${n}\\s*[\\u2014\\-:])`, 'gm',
);
const CHILD_REF_TICKED = (n) => new RegExp(
  `^- \\[x\\]\\s*#${n}\\s*[\\u2014\\-:]`, 'm',
);

function findChildRef(body, n) {
  if (typeof body !== 'string' || !Number.isInteger(n) || n < 1) return null;
  const re = CHILD_REF_UNTICKED(n);
  const m = re.exec(body);
  if (!m) return null;
  return { matchStart: m.index, matchEnd: re.lastIndex };
}

function isAlreadyTicked(body, n) {
  if (typeof body !== 'string' || !Number.isInteger(n) || n < 1) return false;
  return CHILD_REF_TICKED(n).test(body);
}

function tickChildRef(body, n) {
  if (typeof body !== 'string' || !Number.isInteger(n) || n < 1) {
    return { body, changed: false, reason: 'invalid-input' };
  }
  if (isAlreadyTicked(body, n)) {
    return { body, changed: false, reason: 'already-ticked' };
  }
  const re = CHILD_REF_UNTICKED(n);
  if (!re.test(body)) {
    return { body, changed: false, reason: 'no-match' };
  }
  const next = body.replace(CHILD_REF_UNTICKED(n), '- [x]$2');
  return { body: next, changed: next !== body, reason: 'ticked' };
}

function discoverParents(epics, closedN) {
  const matches = [];
  if (!Array.isArray(epics) || !Number.isInteger(closedN) || closedN < 1) return matches;
  for (const ep of epics) {
    if (!ep || typeof ep.body !== 'string') continue;
    if (findChildRef(ep.body, closedN)) {
      matches.push({ number: ep.number, body: ep.body });
    }
  }
  return matches;
}

// CLI mode: stdin = JSON {epics:[{number,body}], closedN:int}; stdout = JSON
// with per-parent updated body for the workflow to PATCH.
if (require.main === module) {
  let buf = '';
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => {
    let input;
    try { input = JSON.parse(buf); }
    catch (e) { process.stderr.write(`bad input json: ${e.message}\n`); process.exit(1); }
    const parents = discoverParents(input.epics || [], input.closedN);
    const updates = parents.map((p) => {
      const r = tickChildRef(p.body, input.closedN);
      return { number: p.number, changed: r.changed, body: r.body, reason: r.reason };
    });
    process.stdout.write(`${JSON.stringify({ updates }, null, 2)}\n`);
  });
}

module.exports = {
  findChildRef, isAlreadyTicked, tickChildRef, discoverParents,
  CHILD_REF_UNTICKED, CHILD_REF_TICKED,
};
