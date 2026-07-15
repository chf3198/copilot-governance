#!/usr/bin/env node
'use strict';
// #3013 Phase B — role-scoped tool policy on top of fleet-mcp-tools default-deny catalog.
const fs = require('node:fs');
const path = require('node:path');
const { authorizeToolCall } = require('./fleet-mcp-tools');

const DEFAULT_CFG = path.join(__dirname, '..', '..', 'config', 'hamr-tool-allowlist.json');

// #3013 — least-privilege built-in default, layered over the #2847 default-deny catalog
// (fleet-mcp-tools). Read tools (github_read/wiki_search/repo_map) for every offload role; the single
// self-comment WRITE only for the two roles that post fleet advisories (collaborator analysis,
// consultant critique) — manager/admin are read-only as a fleet identity. Grants are a strict SUBSET
// of the existing catalog; this never broadens ALLOWED_PERMS or adds a tool. `workflows` are the
// governed offload tool-classes used by workflowCompliance (AC4). The external allowlist at
// DEFAULT_CFG (a deploy-time runtime override) still wins when present + valid; when it is absent /
// unreadable / malformed, loadPolicy falls back here instead of throwing — matching the repo's
// external-config-with-in-code-default convention (cf. authorization-profile.js).
const DEFAULT_POLICY = Object.freeze({
  roles: {
    manager: ['github_read', 'wiki_search', 'repo_map'],
    collaborator: ['github_read', 'wiki_search', 'repo_map', 'github_self_comment'],
    admin: ['github_read', 'wiki_search', 'repo_map'],
    consultant: ['github_read', 'wiki_search', 'repo_map', 'github_self_comment'],
  },
  workflows: ['github_read', 'wiki_search', 'repo_map', 'github_self_comment'],
});

function loadPolicy(cfgPath = DEFAULT_CFG) {
  try {
    const ext = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    // A valid external override must carry a roles map; otherwise fall back to the safe default so a
    // truncated/corrupt file cannot silently disable role-scoping.
    if (ext && typeof ext === 'object' && ext.roles && typeof ext.roles === 'object') {
      return { ...DEFAULT_POLICY, ...ext };
    }
  } catch {
    // absent / unreadable / malformed JSON → least-privilege default (no runtime throw)
  }
  return DEFAULT_POLICY;
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

module.exports = { loadPolicy, evaluateToolPolicy, roleAllows, workflowCompliance, DEFAULT_POLICY };
