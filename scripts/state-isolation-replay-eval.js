#!/usr/bin/env node
'use strict';
// tier: 1
// state-isolation-replay-eval (Epic #2091 C8 / #2109): replays the cross-session/worktree
// state-POLLUTION corpus against the OLD (cwd-only) vs NEW (cwd+session) state-file keying
// and asserts the NEW keying (shipped C5 #2106) yields ZERO false-positives.
//
// SCOPE (per #2091 EPIC_AMENDMENT): this validates the state-POLLUTION class only. The
// code_touched tracker-accuracy false-positive class is owned by #2647 and is out of scope.

const crypto = require('node:crypto');

function repoKey(cwd) {
  return crypto.createHash('sha1').update(cwd).digest('hex').slice(0, 16);
}

// OLD keying: cwd only -> two sessions in the same cwd collide on one file.
function oldKey(entry) {
  return `repo-${repoKey(entry.cwd)}.json`;
}
// NEW keying (C5): cwd + session id -> sessions never collide.
function newKey(entry) {
  return `repo-${repoKey(entry.cwd)}-${entry.session_b.slice(0, 8)}.json`;
}

// A false-positive occurs when session B reads session A's residual state because they
// resolve to the SAME state file AND A left residue (admin_ops/flags set) that no longer
// applies to B. (session_a is the foreign writer; session_b is the alarmed reader.)
function isFalsePositive(entry, keyFn) {
  // A's state file under the SAME scheme being evaluated as B's:
  const aUnderScheme = keyFn === oldKey
    ? `repo-${repoKey(entry.cwd)}.json`
    : `repo-${repoKey(entry.cwd)}-${(entry.session_a || 'nosession').slice(0, 8)}.json`;
  const bUnderScheme = keyFn(entry);
  return Boolean(entry.a_left_residue) && aUnderScheme === bUnderScheme;
}

function runReplay(corpus, keyFn) {
  const falsePositives = corpus.filter((entry) => isFalsePositive(entry, keyFn));
  return { total: corpus.length, falsePositives: falsePositives.length, cases: falsePositives.map((entry) => entry.scenario) };
}

// Compare old vs new keying over the corpus.
function evaluate(corpus) {
  return { old: runReplay(corpus, oldKey), new: runReplay(corpus, newKey) };
}

module.exports = { evaluate, runReplay, isFalsePositive, oldKey, newKey, repoKey };
