#!/usr/bin/env node
'use strict';

// Regression spec for baton-artifact-governance (touched by #3014 to add graceful degradation of the
// out-of-repo megalint signer-registry-check dependency). Self-executing; exit 1 on failure. Hermetic:
// Node built-ins only. Proves (a) the module LOADS even when megalint/signer-registry-check is absent
// (the latent breakage #3014 fixes), and (b) the artifact FINDERS the evidence bridge relies on
// (classifyComment / entries — last-of-each-type) work correctly regardless.

const assert = require('node:assert');
const test = require('node:test');

const bag = require('./baton-artifact-governance');

test('module loads without throwing (graceful megalint fallback)', () => {
  assert.strictEqual(typeof bag.entries, 'function');
  assert.strictEqual(typeof bag.classifyComment, 'function');
});

test('classifyComment recognizes each baton artifact header and maps it to a role', () => {
  const cases = [
    ['**MANAGER_HANDOFF**\nscope: x', 'MANAGER_HANDOFF', 'manager'],
    ['## COLLABORATOR_HANDOFF\nchecks_run: 3', 'COLLABORATOR_HANDOFF', 'collaborator'],
    ['ADMIN_HANDOFF\nbranch: feat/x', 'ADMIN_HANDOFF', 'admin'],
    ['**CONSULTANT_CLOSEOUT**\nverdict: approve', 'CONSULTANT_CLOSEOUT', 'consultant'],
  ];
  for (const [body, artifact, role] of cases) {
    const found = bag.classifyComment(body);
    assert.strictEqual(found.length, 1, `expected one artifact in: ${artifact}`);
    assert.strictEqual(found[0].artifact, artifact);
    assert.strictEqual(found[0].role, role);
  }
});

test('a _SUPERSEDED header is NOT classified as the live artifact', () => {
  assert.strictEqual(bag.classifyComment('**COLLABORATOR_HANDOFF_SUPERSEDED**').length, 0);
});

test('entries returns the last-of-each-type across a comment trail', () => {
  const comments = [
    { body: '**COLLABORATOR_HANDOFF**\nchecks_run: 1' },
    { body: '**COLLABORATOR_HANDOFF**\nchecks_run: 2' }, // supersedes the first
    { body: '**ADMIN_HANDOFF**\nbranch: feat/x' },
  ];
  const es = bag.entries(comments);
  const byArtifact = Object.fromEntries(es.map((e) => [e.artifact, e]));
  assert.ok(byArtifact.COLLABORATOR_HANDOFF.body.includes('checks_run: 2'));
  assert.ok(byArtifact.ADMIN_HANDOFF);
  assert.strictEqual(es.filter((e) => e.artifact === 'COLLABORATOR_HANDOFF').length, 1);
});

test('entries accepts plain-string comments as well as {body} objects', () => {
  const es = bag.entries(['**MANAGER_HANDOFF**\nscope: y']);
  assert.strictEqual(es.length, 1);
  assert.strictEqual(es[0].role, 'manager');
});
