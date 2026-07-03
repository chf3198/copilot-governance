#!/usr/bin/env node
'use strict';
// #3013 Phase B — role-scoped tool policy on top of fleet-mcp-tools default-deny catalog.
const fs = require('node:fs');
const path = require('node:path');
const { authorizeToolCall } = require('./fleet-mcp-tools');

const DEFAULT_CFG = path.join(__dirname, '..', '..', 'config', 'hamr-tool-allowlist.json');

function loadPolicy(cfgPath = DEFAULT_CFG) {
  return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

function roleAllows(policy, role, tool) {
  const key = String(role || '').toLowerCase();
  const allowed = (policy.roles && policy.roles[key]) || [];
  return allowed.includes(tool);
}

function evaluateToolPolicy(toolName, args, ctx = {}, cfgPath = DEFAULT_CFG) {
  const policy = loadPolicy(cfgPath);
  const base = authorizeToolCall(toolName, args);
  if (!base.allowed) return { allowed: false, reason: base.reason, stage: 'catalog' };
  const role = ctx.role || 'collaborator';
  if (!roleAllows(policy, role, toolName)) {
    return { allowed: false, reason: `role '${role}' not permitted for tool '${toolName}'`, stage: 'role' };
  }
  return { allowed: true, perm: base.perm, role, reason: 'ok', stage: 'policy' };
}

function workflowCompliance(policy, role) {
  const allowed = new Set((policy.roles && policy.roles[role]) || []);
  const total = (policy.workflows || []).length;
  const ok = (policy.workflows || []).filter((w) => allowed.has(w)).length;
  return { role, compliant: ok, total, rate: total ? ok / total : 0 };
}

module.exports = { loadPolicy, evaluateToolPolicy, roleAllows, workflowCompliance };
