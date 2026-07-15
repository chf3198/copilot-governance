#!/usr/bin/env node
// worktree-write-intercept (#1854 AC2) — verifies a write path is covered by
// the current session's active lease + session-lock. Designed for PreToolUse
// hook integration: hook calls this with {tool_name, tool_input.file_path};
// non-zero exit blocks the write.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { read } = require('./cross-team-lease-registry');
const { readLock } = require('./worktree-active-session-lock');

const WRITE_TOOLS = new Set([
  'Write', 'Edit', 'NotebookEdit', 'MultiEdit',
  'write_to_file', 'replace_file_content', 'multi_replace_file_content'
]);
const BASH_DESTRUCTIVE_RE = /\b(rm|mv)\s+-[rfRF]+|>\s*['"]?[^|&;]+['"]?\s*(\||$)/;

function isWriteTool(toolName) {
  return WRITE_TOOLS.has(String(toolName || ''));
}

function isDestructiveBash(toolName, toolInput) {
  if (toolName !== 'Bash') return false;
  const cmd = String((toolInput || {}).command || '');
  return BASH_DESTRUCTIVE_RE.test(cmd);
}

function pathRelativeToRoot(rootDir, filePath) {
  if (!filePath) return null;
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);
  const rel = path.relative(rootDir, abs);
  if (rel.startsWith('..')) return null;
  return rel;
}

function pathCovered(leases, ticket, relPath, now = new Date().toISOString()) {
  for (const lease of leases) {
    if (lease.status !== 'active') continue;
    if (lease.expires_at && lease.expires_at < now) continue;
    if (ticket != null && lease.ticket !== ticket) continue;
    for (const claimedPath of (lease.paths || [])) {
      if (relPath === claimedPath) return { covered: true, lease };
      if (relPath.startsWith(claimedPath + '/')) return { covered: true, lease };
    }
  }
  return { covered: false };
}

function evaluate(input, opts = {}) {
  const rootDir = opts.rootDir || process.cwd();
  const toolName = input.tool_name;
  const filePath = (input.tool_input || {}).file_path || (input.tool_input || {}).TargetFile;
  if (!isWriteTool(toolName) && !isDestructiveBash(toolName, input.tool_input)) {
    return { decision: 'allow', reason: 'non-write-tool' };
  }
  const lock = readLock(rootDir);
  if (!lock) return { decision: 'warn', reason: 'no-session-lock-held',
    advice: 'run scripts/worktree-session-start.sh to acquire lock + lease' };
  if (!filePath) return { decision: 'allow', reason: 'no-path-to-validate' };
  const rel = pathRelativeToRoot(rootDir, filePath);
  if (rel == null) return { decision: 'allow', reason: 'path-outside-checkout' };
  const registry = opts.registry || read(opts.registryFile);
  const cov = pathCovered(registry.leases || [], lock.ticket, rel);
  if (!cov.covered) {
    return { decision: 'warn', reason: 'path-not-covered-by-lease',
      advice: `add "${rel}" to lease #${lock.ticket} via cross-team-lease.js refresh`,
      session_lock: lock };
  }
  return { decision: 'allow', reason: 'covered-by-lease', lease_ticket: cov.lease.ticket };
}

module.exports = { evaluate, pathCovered, pathRelativeToRoot, isWriteTool,
  isDestructiveBash, WRITE_TOOLS };
