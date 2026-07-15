#!/usr/bin/env node
'use strict';

// Regression spec for hamr-tool-policy (#3013 Phase B, Epic #3008). Self-executing; exit 1 on any
// failure. Hermetic: Node built-ins only; no network, no external config file required. Proves:
//   (a) role-scoped allow/deny sits on TOP of the #2847 default-deny catalog (unknown/absent tool denied);
//   (b) loadPolicy falls back to the least-privilege DEFAULT_POLICY when the external allowlist is
//       absent / unreadable / malformed / roles-less (the live defect this ticket fixes — the old
//       loader threw), and a VALID external override still wins;
//   (c) least-privilege scopes: the self-comment write is granted only to collaborator/consultant;
//   (d) workflowCompliance for the offload roles is >= 0.99 (AC4).

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadPolicy,
  evaluateToolPolicy,
  roleAllows,
  workflowCompliance,
  DEFAULT_POLICY,
} = require('./hamr-tool-policy');

const tmp = (name) => path.join(os.tmpdir(), `hamr-tool-policy-${process.pid}-${name}`);

test('loadPolicy falls back to DEFAULT_POLICY when the external allowlist is absent (no throw)', () => {
  const missing = tmp('absent.json');
  if (fs.existsSync(missing)) fs.rmSync(missing);
  const p = loadPolicy(missing);
  assert.deepStrictEqual(p, DEFAULT_POLICY);
});

test('loadPolicy falls back on malformed JSON and on a roles-less object', () => {
  const bad = tmp('bad.json');
  fs.writeFileSync(bad, '{ not: valid json ');
  assert.deepStrictEqual(loadPolicy(bad), DEFAULT_POLICY);
  const rolesless = tmp('rolesless.json');
  fs.writeFileSync(rolesless, JSON.stringify({ workflows: ['github_read'] }));
  assert.deepStrictEqual(loadPolicy(rolesless), DEFAULT_POLICY);
  fs.rmSync(bad); fs.rmSync(rolesless);
});

test('a VALID external override wins over the default', () => {
  const ext = tmp('override.json');
  fs.writeFileSync(ext, JSON.stringify({ roles: { collaborator: ['github_read'] } }));
  const p = loadPolicy(ext);
  assert.deepStrictEqual(p.roles.collaborator, ['github_read']);
  // workflows not supplied by the override → filled from DEFAULT_POLICY
  assert.deepStrictEqual(p.workflows, DEFAULT_POLICY.workflows);
  fs.rmSync(ext);
});

test('default-deny catalog: an unknown tool is denied at the catalog stage', () => {
  const v = evaluateToolPolicy('rm_minus_rf', {}, { role: 'collaborator' }, tmp('absent.json'));
  assert.strictEqual(v.allowed, false);
  assert.strictEqual(v.stage, 'catalog');
});

test('role-scope: read tools allowed for every offload role', () => {
  for (const role of ['manager', 'collaborator', 'admin', 'consultant']) {
    const v = evaluateToolPolicy('github_read', { kind: 'repo' }, { role }, tmp('absent.json'));
    assert.strictEqual(v.allowed, true, `github_read should be allowed for ${role}`);
    assert.strictEqual(v.stage, 'policy');
  }
});

test('least-privilege: github_self_comment allowed ONLY for collaborator/consultant', () => {
  const args = { issue: 42, body: 'fleet advisory analysis' };
  for (const role of ['collaborator', 'consultant']) {
    const v = evaluateToolPolicy('github_self_comment', args, { role }, tmp('absent.json'));
    assert.strictEqual(v.allowed, true, `self-comment should be allowed for ${role}`);
  }
  for (const role of ['manager', 'admin']) {
    const v = evaluateToolPolicy('github_self_comment', args, { role }, tmp('absent.json'));
    assert.strictEqual(v.allowed, false, `self-comment must be denied for ${role}`);
    assert.strictEqual(v.stage, 'role');
  }
});

test('roleAllows is a strict subset of the #2847 catalog (no tool outside the catalog)', () => {
  const catalogTools = new Set(['github_read', 'wiki_search', 'repo_map', 'github_self_comment']);
  for (const [role, tools] of Object.entries(DEFAULT_POLICY.roles)) {
    for (const t of tools) {
      assert.ok(catalogTools.has(t), `role ${role} grants non-catalog tool ${t}`);
      assert.ok(roleAllows(DEFAULT_POLICY, role, t));
    }
  }
});

test('AC4: workflowCompliance >= 0.99 for the offload roles', () => {
  for (const role of ['collaborator', 'consultant']) {
    const c = workflowCompliance(DEFAULT_POLICY, role);
    assert.ok(c.rate >= 0.99, `offload role ${role} compliance ${c.rate} < 0.99`);
    assert.strictEqual(c.compliant, c.total);
  }
});
