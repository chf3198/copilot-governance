#!/usr/bin/env node
// git-conflict-predict (#1827) — cross-PR file-overlap detection. Surfaces overlapping
// files BEFORE PR open. Composes with cross-team-conflict-gate.js (lease-side).
'use strict';

const { execSync } = require('node:child_process');

function git(args) {
  try { return execSync(args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

function currentBranch() { return git('git rev-parse --abbrev-ref HEAD'); }

function changedFilesOnBranch(branch, base = 'origin/main') {
  const out = git(`git diff --name-only ${base}...${branch}`);
  return out ? out.split('\n').filter(Boolean) : [];
}

function listOpenPRs(opts = {}) {
  if (opts.mockPRs) return opts.mockPRs;
  const out = git('gh pr list --state open --json number,headRefName,files --limit 100');
  try { return JSON.parse(out || '[]'); } catch { return []; }
}

function prChangedFiles(pr) {
  return (pr.files || []).map(f => f.path);
}

function overlap(setA, setB) {
  const setLookup = new Set(setA);
  return [...new Set(setB)].filter(p => setLookup.has(p));
}

function evaluate(opts = {}) {
  const branch = opts.branch || currentBranch();
  if (process.env.MEGINGJORD_REBASE_DISCIPLINE_DISABLED === '1') {
    return { ok: true, skipped: 'opt-out-env-var', branch };
  }
  const myFiles = opts.myFiles || changedFilesOnBranch(branch);
  if (!myFiles.length) return { ok: true, branch, reason: 'no-changed-files', overlaps: [] };
  const openPRs = listOpenPRs(opts);
  const overlaps = [];
  for (const pr of openPRs) {
    if (pr.headRefName === branch) continue;
    const otherFiles = prChangedFiles(pr);
    const shared = overlap(myFiles, otherFiles);
    if (shared.length > 0) {
      overlaps.push({ pr: pr.number, branch: pr.headRefName, shared_files: shared,
        shared_count: shared.length });
    }
  }
  return { ok: overlaps.length === 0, branch, my_file_count: myFiles.length,
    open_pr_count: openPRs.length, overlap_count: overlaps.length, overlaps };
}

function fmtHuman(result) {
  if (result.skipped) return `(skipped: ${result.skipped})\n`;
  if (result.ok) return `✓ no file overlap with ${result.open_pr_count || 0} open PR(s)\n`;
  const lines = [`⚠ ${result.overlap_count} overlap(s) with open PR(s):`];
  for (const overlap of result.overlaps) {
    lines.push(`  PR #${overlap.pr} (${overlap.branch}): ${overlap.shared_count} file(s)`);
    for (const path of overlap.shared_files.slice(0, 5)) lines.push(`    - ${path}`);
    if (overlap.shared_files.length > 5) lines.push(`    ... +${overlap.shared_files.length - 5} more`);
  }
  return lines.join('\n') + '\n';
}

if (require.main === module) {
  const result = evaluate();
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else process.stdout.write(fmtHuman(result));
  process.exit(result.ok ? 0 : 1);
}

module.exports = { evaluate, changedFilesOnBranch, listOpenPRs, overlap, fmtHuman };
