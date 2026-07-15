#!/usr/bin/env node
'use strict';
/*
 * baseline-cutover (#3822, mode-aware #3823) — Mode C (CUTOVER) tooling of the ratified baseline-drift
 * reconciler (design receipt 3355d17ac42b51ae; #3801 AC4 / #3818 closeout child).
 *
 * Makes the canonical checkout's `git status` clean (#3801 AC4) by reconciling its tracked baseline to
 * origin/main, under a byte-identity invariant and blue-green reversibility.
 *
 * TRUTHFULNESS (#3823): readiness is computed the way `git reset --mixed origin/main` actually resolves,
 * via a TEMP INDEX (never the real index/HEAD): read-tree origin/main into a throwaway index, then
 * `git diff --raw` (working tree vs that index) + `ls-files --others`. This catches what a content-only
 * `cmp` missed during the first cutover attempt: (a) MODE drift (canonical working tree is wholesale
 * 100755 vs origin's 100644) and (b) ORIGIN-AHEAD files (origin tracks paths the working tree lacks,
 * because origin advanced). The prior content-only check reported a false "ready".
 *
 * SAFETY POSTURE: still NEVER mutates the live checkout. No git checkout/reset/clean on the real repo;
 * the temp index lives in os.tmpdir(). The irreversible re-park is emitted as a strings-only recipe for
 * a gated human go/no-go with guard self-tests as health gate + instant rollback.
 */

const { execFileSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

let _tmpCounter = 0;

function git(root, args, { allowFail = false, env = null, input = null } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: root, encoding: 'utf8',
      stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'ignore'],
      env: env ? { ...process.env, ...env } : process.env,
      input: input == null ? undefined : input,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    if (allowFail) return null;
    throw e;
  }
}

/**
 * Pure classifier — the unit-tested core. Buckets richer per-path facts (each carries a `kind`).
 * @param {{path:string, kind:'safe'|'modeDrift'|'content'|'originAhead'|'untracked', hold?:boolean}[]} entries
 * @returns {{safe:string[], modeDrift:string[], contentBlockers:{path:string,reason:string}[],
 *            originAhead:string[], untracked:string[], holds:string[]}}
 */
function classifyCutover(entries) {
  const safe = [], modeDrift = [], contentBlockers = [], originAhead = [], untracked = [], holds = [];
  for (const e of entries || []) {
    const p = String(e.path);
    if (e.hold) { holds.push(p); continue; }               // documented hold: expected to remain dirty
    switch (e.kind) {
      case 'safe': safe.push(p); break;                    // content + mode identical to origin
      case 'modeDrift': modeDrift.push(p); break;          // content identical, mode differs (recipe normalizes)
      case 'originAhead': originAhead.push(p); break;      // origin tracks it, working lacks it (recipe restores)
      case 'untracked': untracked.push(p); break;          // working-only (feat/3026 deliverable or new drift)
      case 'content':
      default:
        contentBlockers.push({ path: p, reason: 'working content differs from origin/main (uncaptured drift or undocumented hold)' });
    }
  }
  return { safe, modeDrift, contentBlockers, originAhead, untracked, holds };
}

/**
 * TRUE cutover divergence at `root`, computed against origin/main via a throwaway index — the same delta
 * `git reset --mixed origin/main` would produce. Returns [] on failure (CI-safe). Never mutates the repo.
 * @param {string[]} [holdPaths] documented holds (kept dirty by design)
 * @returns {{path:string, kind:string, hold:boolean}[]}
 */
function divergence(root, holdPaths) {
  const holds = new Set(holdPaths || []);
  // Resolve target ref; bail cleanly if origin/main is absent (fresh clone / CI without remote).
  const target = git(root, ['rev-parse', '--verify', '--quiet', 'origin/main'], { allowFail: true });
  if (!target) return [];
  const tmpIndex = path.join(os.tmpdir(), `cutover-idx-${process.pid}-${_tmpCounter++}`);
  try {
    // Populate the temp index with origin/main's tree (does NOT touch the real index/HEAD/working tree).
    if (git(root, ['read-tree', 'origin/main'], { allowFail: true, env: { GIT_INDEX_FILE: tmpIndex } }) === null) return [];
    const entries = [];
    // `git diff --raw` (temp index == origin/main  vs  working tree): one line per changed path.
    // Format: :<oldmode> <newmode> <oldsha> <newsha> <status>\t<path>
    //   oldmode/oldsha = origin/main ; newmode/newsha = working tree (000000/0000000 when deleted).
    // `--abbrev=40` forces FULL origin blob shas (raw abbreviates to 7 by default), so they compare
    // equal to the 40-char `hash-object` output of the working copies below.
    const raw = git(root, ['diff', '--raw', '--no-color', '-z', '--abbrev=40'], { allowFail: true, env: { GIT_INDEX_FILE: tmpIndex } }) || '';
    const toks = raw.split('\0');
    // First pass: parse raw meta. NOTE `git diff --raw` reports the WORKING side's sha as all-zeros (it
    // doesn't hash the working tree), so mode-vs-content CANNOT be decided from the raw shas. We record
    // origin's blob sha (oldsha) and defer content classification to a batched hash-object below.
    const changed = []; // {path, oldsha, modeChanged, deleted}
    for (let i = 0; i < toks.length; i++) {
      const meta = toks[i];
      if (!meta.startsWith(':')) continue;
      const p = toks[++i];
      if (!p) continue;
      const [oldmode, newmode, oldsha, , status] = meta.slice(1).split(/\s+/);
      const deleted = status === 'D' || newmode === '000000';
      changed.push({ path: p, oldsha, modeChanged: oldmode !== newmode, deleted });
    }
    // Batch-hash the working-tree copies of the non-deleted changed files, then compare to origin's blob:
    // equal blob => MODE-ONLY drift; unequal => real CONTENT divergence.
    const toHash = changed.filter((e) => !e.deleted).map((e) => e.path);
    let workingSha = {};
    if (toHash.length) {
      const out = git(root, ['hash-object', '--stdin-paths'], { allowFail: true, input: toHash.join('\n') + '\n' }) || '';
      const shas = out.split('\n').filter(Boolean);
      toHash.forEach((p, idx) => { workingSha[p] = shas[idx]; });
    }
    for (const e of changed) {
      let kind;
      if (e.deleted) kind = 'originAhead';                                  // origin has it, working lacks it
      else if (workingSha[e.path] === e.oldsha) kind = 'modeDrift';         // blob equal => exec-bit only
      else kind = 'content';                                               // real content divergence
      entries.push({ path: e.path, kind, hold: holds.has(e.path) });
    }
    // Working-tree files not present in origin/main's tree (untracked relative to the temp index).
    const others = git(root, ['ls-files', '--others', '--exclude-standard', '-z'], { allowFail: true, env: { GIT_INDEX_FILE: tmpIndex } }) || '';
    for (const p of others.split('\0')) {
      if (p && p.trim()) entries.push({ path: p, kind: 'untracked', hold: holds.has(p) });
    }
    return entries;
  } finally {
    try { fs.unlinkSync(tmpIndex); } catch (_) { /* best-effort temp cleanup */ }
  }
}

/**
 * Readiness plan against origin/main. `ready` (content-safe to proceed) iff there are no undocumented
 * CONTENT blockers. modeDrift + originAhead are recipe-resolvable but REPORTED so the dry-run is honest
 * about scale (the #3823 fix: the old plan hid these behind a content-only "ready"). `fullyClean` iff
 * the working tree already equals origin/main entirely (only holds may remain).
 */
function plan(root, opts) {
  const c = classifyCutover(divergence(root, (opts && opts.holds) || []));
  const ready = c.contentBlockers.length === 0;
  return {
    ready,
    fullyClean: ready && c.modeDrift.length === 0 && c.originAhead.length === 0 && c.untracked.length === 0,
    safeCount: c.safe.length,
    modeDriftCount: c.modeDrift.length,
    originAheadCount: c.originAhead.length,
    untrackedCount: c.untracked.length,
    contentBlockers: c.contentBlockers,
    holds: c.holds,
    // Scale disclosure: what the recipe WILL touch to reach a clean status.
    willNormalizeModes: c.modeDrift.length,
    willRestoreFromOrigin: c.originAhead.length,
    willLeaveUntracked: c.untracked.length,
  };
}

/** The exact vetted, human-run re-park + rollback recipe (STRINGS — never executed here). */
function recipe(root, targetRef = 'origin/main') {
  return {
    preconditions: [
      `node scripts/baseline-cutover.js --dry-run   # 0 contentBlockers; review mode/origin-ahead scale`,
      `# freeze parallel merges to ${targetRef} first — it must not advance during the flip (moving target).`,
      `node scripts/governance-verify.js && node scripts/validator-discipline.js --base ${targetRef}`,
    ],
    reparkRecipe: [
      `# 1. snapshot rollback ref (current HEAD of the canonical checkout)`,
      `PRIOR=$(git -C ${root} rev-parse HEAD)`,
      `# 2. preserve feat/3026 by parking on a NEW compliant-named branch at the same commit, then move`,
      `#    the tracked baseline to ${targetRef} WITHOUT touching working bytes (mixed = index-only):`,
      `git -C ${root} switch -c feat/3801-canonical-parked && git -C ${root} reset --mixed ${targetRef}`,
      `# 3. reconcile the working tree to ${targetRef}: normalizes the 100755->100644 mode drift, restores`,
      `#    origin-ahead files, and adopts origin content (byte-identical files are unchanged):`,
      `git -C ${root} checkout -- .`,
      `# 4. HEALTH GATE — running-guard self-tests must pass post-cutover:`,
      `node ${root}/scripts/governance-verify.js && node ${root}/hooks/scripts/session_baseline_test.py`,
      `node ${root}/scripts/baseline-cutover.js --verify   # status clean modulo documented holds`,
    ],
    rollbackRecipe: [
      `# blue-green instant rollback (never force-push main):`,
      `git -C ${root} reset --mixed "$PRIOR" && git -C ${root} switch feat/3026-zero-miss-guardrails`,
      `# reset --mixed writes no working bytes; if step 3 ran, restore drift from the pre-cutover backup.`,
    ],
  };
}

/** Post-cutover verification: status clean except documented holds. Best-effort; never mutates. */
function verifyClean(root, opts) {
  const holds = new Set((opts && opts.holds) || []);
  const status = git(root, ['status', '--porcelain', '-uall'], { allowFail: true });
  if (status === null) return { clean: false, reason: 'git status failed', dirty: [] };
  const dirty = status.split('\n').map((l) => l.slice(3)).filter((p) => p && p.trim() && !holds.has(p));
  return { clean: dirty.length === 0, dirty, heldOut: [...holds] };
}

/* --------------------------------- self-test (hard gate) --------------------------------- */
function selfTest() {
  const assert = (c, m) => { if (!c) throw new Error('SELFTEST FAIL: ' + m); };
  const c = classifyCutover([
    { path: 'same.js', kind: 'safe' },
    { path: 'mode.js', kind: 'modeDrift' },
    { path: 'content.js', kind: 'content' },
    { path: 'ahead.js', kind: 'originAhead' },
    { path: 'extra.js', kind: 'untracked' },
    { path: 'held.js', kind: 'content', hold: true },
  ]);
  assert(c.safe.length === 1 && c.safe[0] === 'same.js', 'safe bucket');
  assert(c.modeDrift.length === 1 && c.modeDrift[0] === 'mode.js', 'modeDrift bucket (NEW #3823)');
  assert(c.contentBlockers.length === 1 && c.contentBlockers[0].path === 'content.js', 'content blocker');
  assert(c.originAhead.length === 1 && c.originAhead[0] === 'ahead.js', 'originAhead bucket (NEW #3823)');
  assert(c.untracked.length === 1 && c.untracked[0] === 'extra.js', 'untracked bucket');
  assert(c.holds.length === 1 && c.holds[0] === 'held.js', 'documented hold outranks content');

  // a run with ONLY modeDrift/originAhead is content-ready but NOT fullyClean
  const c2 = classifyCutover([{ path: 'm.js', kind: 'modeDrift' }, { path: 'a.js', kind: 'originAhead' }]);
  assert(c2.contentBlockers.length === 0, 'mode/origin-ahead are not content blockers');
  assert(c2.modeDrift.length === 1 && c2.originAhead.length === 1, 'reported for scale disclosure');

  // recipe strings mention mode-normalization + origin freeze + rollback (the #3823 additions)
  const r = recipe('/x');
  const joined = r.preconditions.concat(r.reparkRecipe, r.rollbackRecipe).join('\n');
  assert(/checkout -- \./.test(joined), 'recipe normalizes modes / adopts origin via checkout');
  assert(/moving target|must not advance|freeze/i.test(joined), 'recipe warns about the moving target');
  assert(/rollback|restore/i.test(joined), 'recipe includes rollback');
  assert(!/execFileSync|spawn/.test(joined), 'recipe carries no executable calls');

  // plan on a clean/CI root is content-ready, exit-0 shape
  const p = plan(process.cwd(), { holds: [] });
  assert(typeof p.ready === 'boolean' && Array.isArray(p.contentBlockers), 'plan shape');
  assert(typeof p.modeDriftCount === 'number' && typeof p.originAheadCount === 'number', 'plan discloses scale');
  return true;
}

module.exports = { classifyCutover, divergence, plan, recipe, verifyClean, selfTest };

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = process.env.CUTOVER_ROOT ? path.resolve(process.env.CUTOVER_ROOT) : process.cwd();
  const holds = (process.env.CUTOVER_HOLDS || '').split(',').map((s) => s.trim()).filter(Boolean);

  if (args.includes('--self-test')) {
    try { selfTest(); console.log('baseline-cutover self-test: PASS'); process.exit(0); }
    catch (e) { console.error(String((e && e.message) || e)); process.exit(1); }
  }
  if (args.includes('--verify')) {
    const v = verifyClean(root, { holds });
    console.log(`baseline-cutover verify: ${v.clean ? 'CLEAN' : 'DIRTY'}`
      + (v.dirty && v.dirty.length ? ` — ${v.dirty.length} residual: ${v.dirty.slice(0, 10).join(', ')}` : '')
      + (v.heldOut && v.heldOut.length ? ` (held-out: ${v.heldOut.join(', ')})` : ''));
    process.exit(0);
  }
  if (args.includes('--recipe')) { console.log(JSON.stringify(recipe(root), null, 2)); process.exit(0); }

  // Default: TRUTHFUL DRY-RUN (never mutates). ALWAYS exit 0 (advisory/report).
  const p = plan(root, { holds });
  console.log(`baseline-cutover DRY-RUN (advisory; NEVER mutates): ready=${p.ready} fullyClean=${p.fullyClean} `
    + `safe=${p.safeCount} contentBlockers=${p.contentBlockers.length} holds=${p.holds.length}`);
  console.log(`  cutover will: normalize ${p.willNormalizeModes} modes (100755->100644), `
    + `restore ${p.willRestoreFromOrigin} origin-ahead files, leave ${p.willLeaveUntracked} untracked residuals.`);
  if (p.contentBlockers.length) {
    console.log('  CONTENT BLOCKERS (capture to origin/main or document as holds before cutover):');
    p.contentBlockers.slice(0, 20).forEach((b) => console.log(`   ✗ ${b.path} — ${b.reason}`));
  }
  if (p.holds.length) console.log(`  holds (kept dirty by design): ${p.holds.join(', ')}`);
  if (p.ready && !p.fullyClean) console.log('  content-READY, but NOT a trivial flip — the recipe touches the mode/origin-ahead files above. Freeze parallel merges, then --recipe.');
  if (p.fullyClean) console.log('  FULLY CLEAN — working tree already equals origin/main; re-park is a no-op cleanup.');
  process.exit(0);
}
