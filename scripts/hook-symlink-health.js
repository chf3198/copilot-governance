#!/usr/bin/env node
// hook-symlink-health.js — detect cyclic / unreadable deployed hook scripts (#2972).
//
// Root-cause context: a non-idempotent `ln -sf` could point a deployed hook
// (e.g. ~/.copilot/hooks/scripts/pretool_guard.py) at itself, producing an
// ELOOP "too many levels of symbolic links". Because that file backs the
// PreToolUse hook, the failure blocks every subsequent tool call and the
// operator is locked out with no way to self-recover. This module makes the
// condition visible (and `repairBrokenLink` removes the offending link) so the
// brick is detectable via `npm run hamr:doctor` instead of being silent.
//
// Pure-ish: the scan only reads the filesystem (lstat / access / unlink on
// --fix). No network, no paid resources.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { homedir } = require('node:os');

// Deployed hook-script directories scanned by default, across runtimes.
function defaultHookRoots() {
  const home = homedir();
  return [
    path.join(home, '.copilot', 'hooks', 'scripts'),
    path.join(home, '.claude', 'hooks', 'scripts'),
    path.join(home, '.codex', 'hooks', 'scripts'),
    path.join(home, '.cursor', 'hooks', 'scripts'),
  ];
}

// Classify a single path. Returns null when healthy, else a reason string.
// 'cyclic'     — the symlink chain loops (ELOOP on stat/realpath).
// 'dangling'   — symlink whose target does not exist.
// 'unreadable' — exists but cannot be opened for read (e.g. permissions).
function classifyPath(p) {
  let lst;
  try {
    lst = fs.lstatSync(p);
  } catch {
    return null; // absent at the lstat level — nothing deployed here.
  }
  if (lst.isSymbolicLink()) {
    try {
      fs.statSync(p); // follows the link; ELOOP throws here for a cyclic link.
    } catch (err) {
      return err && err.code === 'ELOOP' ? 'cyclic' : 'dangling';
    }
  }
  try {
    fs.accessSync(p, fs.constants.R_OK);
  } catch (err) {
    return err && err.code === 'ELOOP' ? 'cyclic' : 'unreadable';
  }
  return null;
}

// Scan one or more hook-root directories for cyclic / unreadable scripts.
// Returns { scanned: <count>, broken: [{ path, reason }] }.
function scanHookHealth(roots = defaultHookRoots()) {
  const broken = [];
  let scanned = 0;
  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue; // root absent or itself unreadable — skip, not a hook brick.
    }
    for (const entry of entries) {
      if (!entry.endsWith('.py') && !entry.endsWith('.sh')) continue;
      const full = path.join(root, entry);
      scanned += 1;
      const reason = classifyPath(full);
      if (reason) broken.push({ path: full, reason });
    }
  }
  return { scanned, broken };
}

// Self-repair: remove a broken (cyclic/dangling/unreadable) hook link so the
// operator can re-deploy. Returns true when something was removed.
function repairBrokenLink(p) {
  try {
    fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

// Operator-facing remediation lines for a scan result.
function hookHealthRemediations(result) {
  if (!result || result.broken.length === 0) return [];
  return result.broken.map((b) => ({
    capability: 'hook_symlink',
    advice: `${b.reason} hook script: ${b.path} — run \`npm run hamr:doctor --fix\` to remove it, then \`npm run deploy:claude:apply\` to re-materialize`,
  }));
}

module.exports = {
  defaultHookRoots,
  classifyPath,
  scanHookHealth,
  repairBrokenLink,
  hookHealthRemediations,
};
