#!/usr/bin/env node
'use strict';
// #3013 — HAMR tool-surface proxy: policy gate → fleet-mcp-broker → audited envelope.
const { evaluateToolPolicy } = require('./hamr-tool-policy');
const { appendAudit } = require('./hamr-tool-audit');
const { invokeTool } = require('./fleet-mcp-broker');

async function proxyToolCall(toolName, args = {}, ctx = {}, deps = {}) {
  const logPath = deps.logPath;
  const verdict = evaluateToolPolicy(toolName, args, ctx);
  appendAudit({ tool: toolName, role: ctx.role || 'collaborator', allowed: verdict.allowed, reason: verdict.reason, stage: verdict.stage }, logPath);
  if (!verdict.allowed) return { ok: false, reason: verdict.reason, audited: true };
  const out = invokeTool(toolName, args, deps);
  appendAudit({ tool: toolName, role: ctx.role || 'collaborator', allowed: out.ok, reason: out.ok ? 'executed' : out.reason, stage: 'execute' }, logPath);
  return { ...out, audited: true, perm: verdict.perm };
}

function topWorkflowCompliance(roles = ['manager', 'collaborator', 'admin', 'consultant']) {
  const { loadPolicy, workflowCompliance } = require('./hamr-tool-policy');
  const policy = loadPolicy();
  return roles.map((r) => workflowCompliance(policy, r));
}

module.exports = { proxyToolCall, topWorkflowCompliance };

if (require.main === module) {
  const [,, tool, role, jsonArgs] = process.argv;
  if (!tool) { console.error('usage: hamr-tool-proxy.js <tool> [role] [jsonArgs]'); process.exit(1); }
  const args = jsonArgs ? JSON.parse(jsonArgs) : {};
  proxyToolCall(tool, args, { role: role || 'collaborator' }).then((r) => {
    process.stdout.write(`${JSON.stringify(r)}\n`);
    process.exit(r.ok ? 0 : 2);
  });
}
