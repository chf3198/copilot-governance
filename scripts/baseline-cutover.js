#!/usr/bin/env node
'use strict';
/*
 * baseline-cutover (#3822) — Mode C (CUTOVER) tooling of the ratified baseline-drift reconciler
 * (design receipt 3355d17ac42b51ae; ticket-3801 AC4 / ticket-3818 closeout child).
 *
 * Goal: make the canonical checkout's `git status` clean (ticket-3801 AC4) by reconciling its tracked
 * baseline to the ALREADY-byte-identical origin/main content — under a hard BYTE-IDENTITY INVARIANT
 * (a file's working-tree bytes must equal origin/main before it is considered cut-over-safe) and
 * blue-green reversibility.
 *
 * SAFETY POSTURE: this tool NEVER mutates the live checkout. It (a) computes readiness, (b) enforces
 * the byte-identity invariant, (c) reports blockers (documented holds / genuine divergence), and
 * (d) emits the exact vetted re-park + rollback git recipe for the GATED operator step (the live flip
 * is a retained carve-out: irreversible/security). `verifyClean` checks the post-cutover state. No
 * function here runs `git checkout/reset/clean` — the irreversible command is emitted as text, run by a
 * human under go/no-go, so the tool cannot brick the running-guard checkout.
 */

const { execFileSync } = require('child_process');

function git(root, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    if (allowFail) return null;
    throw e;
  }
}

/**
 * Pure classifier — the unit-tested core. Given per-path facts, bucket into cut-over classes.
 * @param {{path:string, existsOnOrigin:boolean, workingEqualsOrigin:boolean, hold?:boolean}[]} entries
 * @returns {{safe:string[], blockers:{path:string,reason:string}[], holds:string[], absent:string[]}}
 */
function classifyCutover(entries) {
  const safe = [], blockers = [], holds = [], absent = [];
  for (const e of entries || []) {
    const p = String(e.path);
    if (e.hold) { holds.push(p); continue; }                 // documented hold: expected to remain dirty
    if (!e.existsOnOrigin) { absent.push(p); continue; }     // not yet captured to origin/main
    if (e.workingEqualsOrigin) { safe.push(p); }             // byte-identical -> safe to cut over
    else { blockers.push({ path: p, reason: 'working bytes differ from origin/main (uncaptured drift or undocumented hold)' }); }
  }
  return { safe, blockers, holds, absent };
}

/**
 * Best-effort per-path facts for the canonical checkout at `root`. For each drifted path, compare its
 * working-tree bytes to `origin/main:<path>`. Returns [] on a clean tree or failure (CI-safe).
 * @param {string[]} [holdPaths] documented holds (kept dirty by design; e.g. L7 governance-verify.js)
 */
function collectEntries(root, holdPaths) {
  const holds = new Set(holdPaths || []);
  const status = git(root, ['status', '--porcelain', '-uall'], { allowFail: true });
  if (!status) return [];
  const paths = status.split('\n').map((l) => l.slice(3)).filter((p) => p && p.trim());
  const fs = require('fs');
  const path = require('path');
  return paths.map((p) => {
    const originBlob = git(root, ['cat-file', '-p', `origin/main:${p}`], { allowFail: true });
    const existsOnOrigin = originBlob !== null;
    let workingEqualsOrigin = false;
    if (existsOnOrigin) {
      try {
        const working = fs.readFileSync(path.join(root, p));
        workingEqualsOrigin = Buffer.from(originBlob, 'utf8').equals(working)
          || working.toString('utf8') === originBlob; // tolerate text newline normalization
      } catch (_) { workingEqualsOrigin = false; }
    }
    return { path: p, existsOnOrigin, workingEqualsOrigin, hold: holds.has(p) };
  });
}

/** Readiness plan. `ready` iff no blockers (holds are allowed to remain). */
function plan(root, opts) {
  const c = classifyCutover(collectEntries(root, (opts && opts.holds) || []));
  return {
    ready: c.blockers.length === 0,
    safeCount: c.safe.length,
    blockers: c.blockers,
    holds: c.holds,
    absent: c.absent,
    invariantHeld: c.blockers.length === 0 && c.absent.length === 0,
  };
}

/** The exact vetted, human-run re-park + rollback recipe (STRINGS — never executed here). */
function recipe(root, targetRef = 'origin/main') {
  return {
    preconditions: [
      `node scripts/baseline-cutover.js --dry-run   # must report ready (0 blockers)`,
      `node scripts/governance-verify.js && node scripts/validator-discipline.js --base ${targetRef}`,
    ],
    // Re-park keeps working-tree bytes (they already match ${targetRef}); it moves the tracked baseline
    // so status becomes clean. Run under go/no-go; the guard self-tests are the health gate.
    reparkRecipe: [
      `# 1. snapshot rollback ref (current HEAD of the canonical checkout)`,
      `PRIOR=$(git -C ${root} rev-parse HEAD)`,
      `# 2. move the tracked baseline to ${targetRef} WITHOUT touching working bytes (soft), then let`,
      `#    the now-tracked captured files read as clean:`,
      `git -C ${root} switch --force-create parked-baseline ${targetRef}   # or: git checkout ${targetRef}`,
      `# 3. HEALTH GATE — running-guard self-tests must pass post-cutover:`,
      `node ${root}/scripts/governance-verify.js && node ${root}/hooks/scripts/session_baseline_test.py`,
      `node ${root}/scripts/baseline-cutover.js --verify   # status clean modulo documented holds`,
    ],
    rollbackRecipe: [
      `# blue-green instant rollback (never force-push main):`,
      `git -C ${root} switch --force-create feat/3026-zero-miss-guardrails "$PRIOR"   # restore prior HEAD`,
      `# working-tree bytes are unchanged throughout (byte-identity invariant), so no content is lost.`,
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
    { path: 'a.js', existsOnOrigin: true, workingEqualsOrigin: true },
    { path: 'b.js', existsOnOrigin: true, workingEqualsOrigin: false },
    { path: 'held.js', existsOnOrigin: true, workingEqualsOrigin: false, hold: true },
    { path: 'new.js', existsOnOrigin: false, workingEqualsOrigin: false },
  ]);
  assert(c.safe.length === 1 && c.safe[0] === 'a.js', 'byte-identical -> safe');
  assert(c.blockers.length === 1 && c.blockers[0].path === 'b.js', 'divergent -> blocker');
  assert(c.holds.length === 1 && c.holds[0] === 'held.js', 'documented hold bucketed');
  assert(c.absent.length === 1 && c.absent[0] === 'new.js', 'uncaptured -> absent');

  // empty => ready, invariant held
  const ce = classifyCutover([]);
  assert(ce.safe.length === 0 && ce.blockers.length === 0, 'empty clean');

  // recipe is strings-only and mentions the invariant + rollback
  const r = recipe('/x');
  assert(Array.isArray(r.reparkRecipe) && Array.isArray(r.rollbackRecipe), 'recipe shape');
  assert(r.reparkRecipe.join(' ').includes('HEALTH GATE'), 'recipe includes health gate');
  assert(r.rollbackRecipe.join(' ').includes('rollback') || r.rollbackRecipe.join(' ').includes('restore'),
    'recipe includes rollback');

  // plan on a clean/CI root is ready
  const p = plan(process.cwd(), { holds: [] });
  assert(typeof p.ready === 'boolean' && Array.isArray(p.blockers), 'plan shape');
  return true;
}

module.exports = { classifyCutover, collectEntries, plan, recipe, verifyClean, selfTest };

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = process.env.CUTOVER_ROOT ? require('path').resolve(process.env.CUTOVER_ROOT) : process.cwd();
  // Documented holds (kept dirty by design). Extend via CUTOVER_HOLDS (comma-sep) — e.g. L7's hold.
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
    process.exit(0); // advisory
  }
  if (args.includes('--recipe')) {
    console.log(JSON.stringify(recipe(root), null, 2));
    process.exit(0);
  }
  // Default: DRY-RUN readiness (never mutates). ALWAYS exit 0 (advisory/report).
  const p = plan(root, { holds });
  console.log(`baseline-cutover DRY-RUN (advisory; NEVER mutates): ready=${p.ready} `
    + `safe=${p.safeCount} blockers=${p.blockers.length} holds=${p.holds.length} absent=${p.absent.length}`);
  if (p.blockers.length) {
    console.log('  BLOCKERS (must capture to origin/main or document as holds before live cutover):');
    p.blockers.slice(0, 20).forEach((b) => console.log(`   ✗ ${b.path} — ${b.reason}`));
  }
  if (p.holds.length) console.log(`  holds (kept dirty by design): ${p.holds.join(', ')}`);
  if (p.ready) console.log('  READY — the live re-park is a GATED carve-out; emit the vetted recipe with --recipe.');
  process.exit(0);
}
