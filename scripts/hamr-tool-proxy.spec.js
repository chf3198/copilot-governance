#!/usr/bin/env node
'use strict';

// End-to-end regression spec for hamr-tool-proxy (#3013 Phase B, Epic #3008). Self-executing; exit 1
// on failure. Hermetic: drives the REAL proxy -> hamr-tool-policy -> fleet-mcp-broker chain with the
// broker's own injection seam (deps.exec) stubbed, so no gh/network is touched. Covers the #3013
// Validation "end-to-end tests covering approved and blocked tool calls" AC: an approved read reaches
// execution and emits a policy + execute audit row; a role-denied write and an unknown tool are both
// stopped before the broker and emit exactly one audited deny row each.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { proxyToolCall, topWorkflowCompliance } = require('./hamr-tool-proxy');
const { readAudit } = require('./hamr-tool-audit');

let seq = 0;
const freshLog = () => {
  const p = path.join(os.tmpdir(), `hamr-proxy-audit-${process.pid}-${seq++}.jsonl`);
  if (fs.existsSync(p)) fs.rmSync(p);
  return p;
};

test('approved read: policy allows -> broker exec runs -> policy + execute audit rows', async () => {
  const log = freshLog();
  let execCalls = 0;
  // broker ghRead does JSON.parse(exec(...)) — return a JSON string.
  const exec = () => { execCalls += 1; return JSON.stringify({ title: 't', state: 'open' }); };
  const out = await proxyToolCall(
    'github_read',
    { kind: 'issue', number: 7 },
    { role: 'collaborator' },
    { logPath: log, exec },
  );
  assert.strictEqual(out.ok, true, `expected ok, got ${JSON.stringify(out)}`);
  assert.strictEqual(out.audited, true);
  assert.strictEqual(execCalls, 1);
  const rows = readAudit(log, 50);
  assert.strictEqual(rows.length, 2, 'expect a policy row + an execute row');
  assert.strictEqual(rows[0].stage, 'policy');
  assert.strictEqual(rows[0].allowed, true);
  assert.strictEqual(rows[1].stage, 'execute');
  assert.ok(rows.every((r) => r.tool === 'github_read' && r.role === 'collaborator'));
  fs.rmSync(log);
});

test('blocked write (role deny): broker exec NEVER runs -> single audited deny row', async () => {
  const log = freshLog();
  let execCalls = 0;
  const exec = () => { execCalls += 1; return '{}'; };
  // manager is read-only as a fleet identity -> self-comment write denied at the role stage.
  const out = await proxyToolCall(
    'github_self_comment',
    { issue: 7, body: 'analysis' },
    { role: 'manager' },
    { logPath: log, exec },
  );
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.audited, true);
  assert.match(out.reason, /not permitted/);
  assert.strictEqual(execCalls, 0, 'broker must not run on a denied call');
  const rows = readAudit(log, 50);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].allowed, false);
  assert.strictEqual(rows[0].stage, 'role');
  fs.rmSync(log);
});

test('blocked unknown tool: denied at catalog stage, no exec', async () => {
  const log = freshLog();
  let execCalls = 0;
  const out = await proxyToolCall(
    'shell_exec',
    { cmd: 'id' },
    { role: 'collaborator' },
    { logPath: log, exec: () => { execCalls += 1; return '{}'; } },
  );
  assert.strictEqual(out.ok, false);
  assert.strictEqual(execCalls, 0);
  const rows = readAudit(log, 50);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].stage, 'catalog');
  fs.rmSync(log);
});

test('topWorkflowCompliance reports all four baton roles; offload role >= 0.99', () => {
  const rows = topWorkflowCompliance();
  const roles = rows.map((r) => r.role).sort();
  assert.deepStrictEqual(roles, ['admin', 'collaborator', 'consultant', 'manager']);
  const collab = rows.find((r) => r.role === 'collaborator');
  assert.ok(collab.rate >= 0.99);
});
