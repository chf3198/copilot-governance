#!/usr/bin/env node
'use strict';
/* eslint-disable jsdoc/require-jsdoc, complexity */
const fs = require('fs');
const { execFileSync } = require('child_process');
const TICKET_RE = /(?:^|\/)(?:feat|fix|chore|docs|refactor|hotfix)\/(\d+)-/;
function git(args, cwd) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}
function gitOk(args, cwd) {
  try { execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'ignore'] }); return true; } catch { return false; }
}
function gh(args) {
  try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; }
}
function parsePorcelain(raw) {
  return raw.split('\n\n').filter(Boolean).map(block => {
    const item = { locked: false, prunable: false, detached: false, missing: false };
    for (const line of block.split('\n')) {
      const [key, ...rest] = line.split(' ');
      const value = rest.join(' ');
      if (key === 'worktree') item.path = value; else if (key === 'HEAD') item.head = value;
      else if (key === 'branch') item.branch = value.replace('refs/heads/', '');
      else if (key === 'detached') item.detached = true;
      else if (key === 'locked') { item.locked = true; item.lockReason = value || null; }
      else if (key === 'prunable') { item.prunable = true; item.prunableReason = value || null; }
    }
    if (item.path && !fs.existsSync(item.path)) item.missing = true;
    return item;
  });
}
function ticketFrom(branch = '') { const hit = branch.match(TICKET_RE); return hit ? Number(hit[1]) : null; }
function splitStatus(raw) {
  const lines = raw ? raw.split('\n').filter(Boolean) : [];
  return { dirtyCount: lines.filter(l => !l.startsWith('??')).length, untrackedCount: lines.filter(l => l.startsWith('??')).length };
}
function classify(entry) {
  if (entry.prunable || entry.missing) return 'prunable-metadata';
  if (entry.locked) return 'active';
  if (entry.detached || !entry.branch) {
    if (entry.dirty || entry.untracked || entry.ahead > 0) return 'rescue-needed';
    return 'detached-temp';
  }
  if (entry.branch === 'main' || entry.branch.startsWith('sandbox/')) return 'active';
  if (!entry.ticket) return entry.dirty || entry.untracked || entry.ahead > 0
    ? 'rescue-needed' : 'ready/parked';
  if (entry.dirty || entry.untracked || entry.ahead > 0) return 'stale-risky';
  if (entry.upstream === null) return 'abandoned';
  if (entry.mergedToMain && !entry.openPr) return 'stale-safe';
  if ((entry.behind || 0) >= 50) return 'stale-warning';
  return 'ready/parked';
}
function degraded(kind, branch) {
  // G5: labeled degraded signal; conservative merged=false. Quiet in CI/cron.
  if (!process.env.MEGINGJORD_QUIET_RESOLVER) process.stderr.write(`[worktree-inventory] degraded: ${kind} for ${branch}; conservative merged=false\n`);
}
function mergedToMain(entry, runGit, runGh, cache) {
  if (!entry.branch || entry.branch === 'main') return false;
  const byAncestry = runGit === git ? gitOk(['merge-base', '--is-ancestor', entry.head, 'origin/main'], entry.path) : runGit(['merge-base', '--is-ancestor', entry.head, 'origin/main'], entry.path) === 'yes';
  if (byAncestry || !runGh || !cache) return byAncestry;
  if (cache[entry.branch] === undefined) try { const out = runGh(['pr', 'list', '--head', entry.branch, '--state', 'merged', '--json', 'number']); if (out === null) degraded('merge-probe-unreachable', entry.branch); cache[entry.branch] = out !== null && JSON.parse(out).length > 0; } catch { cache[entry.branch] = false; }
  return cache[entry.branch];
}
function openPrFor(entry, runGh, cache) {
  // #2691: a merged worktree with an OPEN pr is not safe to remove.
  if (!entry.branch || entry.branch === 'main' || !runGh || !cache) return false;
  if (cache[entry.branch] === undefined) {
    try { const out = runGh(['pr', 'list', '--head', entry.branch, '--state', 'open', '--json', 'number']);
      if (out === null) { degraded('open-pr-probe-unreachable', entry.branch); cache[entry.branch] = false; }
      else cache[entry.branch] = JSON.parse(out).length > 0; } catch { cache[entry.branch] = false; }
  }
  return cache[entry.branch];
}
function enrich(entry, runGit = git, runGh = null, squashCache = null, openPrCache = null) {
  if (entry.missing || entry.prunable) {
    const enriched = { ...entry, ticket: ticketFrom(entry.branch || ''), dirty: false,
      untracked: false, ahead: null, behind: null };
    return { ...enriched, lifecycleState: classify(enriched), removalSafe: false };
  }
  const status = splitStatus(runGit(['status', '--porcelain', '--untracked-files=all'], entry.path));
  const upstream = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], entry.path);
  const upstreamDiv = upstream ? runGit(['rev-list', '--left-right', '--count', `${upstream}...HEAD`], entry.path) : '';
  const mainDiv = runGit(['rev-list', '--left-right', '--count', 'origin/main...HEAD'], entry.path);
  const [upstreamBehind, upstreamAhead] = upstreamDiv ? upstreamDiv.split(/\s+/).map(Number) : [null, null];
  const [behind, mainAhead] = mainDiv ? mainDiv.split(/\s+/).map(Number) : [null, null];
  const lastActivity = runGit(['log', '-1', '--format=%cI'], entry.path) || null;
  const isClean = status.dirtyCount === 0 && status.untrackedCount === 0;
  // AC1.2: resolve merge state regardless of cleanliness so #3358 has a dirty-path signal.
  const mergeResolved = mergedToMain(entry, runGit, runGh, squashCache);
  const squashMerged = isClean ? mergeResolved : false; // clean-path semantics unchanged
  // new dirty-path signal consumed by the dirty+merged reconciler (Epic 3352 C3).
  const mergedToMainDirty = isClean ? false : mergeResolved;
  // openPr guard absorbs the open-PR misclassification edge.
  const openPr = openPrFor(entry, runGh, openPrCache);
  const enriched = { ...entry, ticket: ticketFrom(entry.branch || ''), upstream: upstream || null,
    ahead: upstreamAhead, behind, mainAhead, upstreamBehind,
    dirtyCount: status.dirtyCount, untrackedCount: status.untrackedCount,
    dirty: status.dirtyCount > 0, untracked: status.untrackedCount > 0,
    mergedToMain: squashMerged, squashMerged, mergedToMainDirty, openPr, lastActivity };
  const lifecycleState = classify(enriched);
  return { ...enriched, lifecycleState, action: lifecycleState, removalSafe: lifecycleState === 'stale-safe' };
}
function inventory(raw = git(['worktree', 'list', '--porcelain']), opts = {}) {
  const runGit = opts.runGit || git;
  const runGh = opts.runGh !== undefined ? opts.runGh : null;
  const squashCache = runGh ? {} : null;
  const openPrCache = runGh ? {} : null;
  return { generatedAt: new Date().toISOString(), mode: 'read-only',
    worktrees: parsePorcelain(raw).map(entry => enrich(entry, runGit, runGh, squashCache, openPrCache)) };
}
function print(report, json) {
  if (json) return console.log(JSON.stringify(report, null, 2));
  for (const w of report.worktrees) console.log(`${w.lifecycleState.padEnd(18)} ${String(w.ticket || '-').padEnd(6)} ${w.branch || 'DETACHED'} ${w.path}`);
}
if (require.main === module) print(inventory(), process.argv.includes('--json'));
module.exports = { classify, enrich, gh, inventory, openPrFor, parsePorcelain, ticketFrom };
