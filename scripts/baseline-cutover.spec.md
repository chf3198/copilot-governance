# baseline-cutover — spec (#3822 · ticket-3801 AC4 / ticket-3818 closeout Mode C)

The CUTOVER-tooling mode of the ratified reconciler (design receipt `3355d17ac42b51ae`). Makes the
canonical checkout's `git status` clean (ticket-3801 AC4) by reconciling its tracked baseline to the
already-byte-identical `origin/main` content, under a **byte-identity invariant** and blue-green
reversibility.

## SAFETY POSTURE (why this is safe to ship)
The tool **never mutates** the live checkout. No function runs `git checkout/reset/clean`. It computes
readiness, enforces the invariant, reports blockers/holds, and **emits the exact re-park + rollback
recipe as strings** for the GATED operator step. The live re-park is a **retained carve-out**
(irreversible/security) — done by a human under go/no-go, with the guard self-tests as a health gate and
an instant blue-green rollback (working-tree bytes never change).

## API
- `classifyCutover(entries) → {safe[], blockers[], holds[], absent[]}` — pure, unit-tested. `safe` =
  byte-identical to origin/main; `blocker` = diverges (uncaptured / undocumented); `hold` = documented
  keep-dirty (e.g. L7 `governance-verify.js`); `originAhead` = origin tracks it, working lacks it;
  `untracked` = working-only residual (feat/3026 deliverable / new drift).
- `divergence(root, holds) → entries[]` **(#3823, replaces content-only `collectEntries`)** — computes
  the TRUE cutover delta the way `git reset --mixed origin/main` resolves, via a **temp index**
  (`GIT_INDEX_FILE` + `read-tree origin/main`), then `git diff --raw --abbrev=40 -z` + a batched
  `hash-object --stdin-paths`. Distinguishes **mode-only** (working blob == origin blob, exec-bit
  differs) from real **content** divergence, and detects **origin-ahead** deletes. Never touches the
  real index/HEAD/working tree.
- `plan(root, {holds}) → {ready, fullyClean, safeCount, modeDriftCount, originAheadCount, untrackedCount,
  contentBlockers, holds, willNormalizeModes, willRestoreFromOrigin, willLeaveUntracked}` — `ready` iff
  0 **content** blockers; `fullyClean` iff nothing but holds remain. modeDrift/originAhead are
  recipe-resolvable and REPORTED for honest scale disclosure.
- `recipe(root, ref?) → {preconditions, reparkRecipe, rollbackRecipe}` — strings only; carries no
  executable calls. Includes `checkout -- .` (mode-normalize + origin catch-up) and a moving-target freeze.
- `verifyClean(root, {holds}) → {clean, dirty[], heldOut[]}` — post-cutover status check.
- `selfTest()` — hard-gate assertions.

## Invariants
1. **Truthful readiness (#3823):** the dry-run reflects the ACTUAL `reset --mixed` delta — mode-only
   changes are counted as `modeDrift` (not content), and files origin has but the working tree lacks are
   counted as `originAhead`. A content-only `cmp` gave a false "ready" (it missed 837 mode + 214
   origin-ahead on the real checkout); this is the defect #3823 fixes.
2. **Non-mutating / CI-safe:** dry-run/verify/divergence never change the repo (temp index in `os.tmpdir()`);
   a clean checkout ⇒ ready + fullyClean, exit 0.
3. **Reversible:** the emitted recipe preserves byte content and includes an instant rollback (never
   force-pushes main).
4. Holds (documented keep-dirty) are never content blockers.

## Enforced root
`.github/workflows/baseline-cutover.yml` runs the spec (hard gate) + the dry-run (advisory), making
`scripts/baseline-cutover.js` ENFORCED (enforcement-wiring-audit) with a sibling spec + registry entry.

## Not in scope
The live re-park EXECUTION (the carve-out) — gated on dry-run-ready + guard self-tests + human go/no-go.
This tool ships the safety rails and recipe; it does not itself Close ticket-3801/ticket-3818.
