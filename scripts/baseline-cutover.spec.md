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
  keep-dirty (e.g. L7 `governance-verify.js`); `absent` = not yet on origin/main.
- `collectEntries(root, holds) → entries[]` — per drifted path, compares working bytes to
  `origin/main:<path>` (best-effort; `[]` on clean/failure → CI-safe).
- `plan(root, {holds}) → {ready, safeCount, blockers, holds, absent, invariantHeld}` — `ready` iff 0
  blockers (holds allowed to remain).
- `recipe(root, ref?) → {preconditions, reparkRecipe, rollbackRecipe}` — strings only; carries no
  executable calls.
- `verifyClean(root, {holds}) → {clean, dirty[], heldOut[]}` — post-cutover status check.
- `selfTest()` — hard-gate assertions.

## Invariants
1. **Byte-identity:** a path is `safe` only when its working bytes equal `origin/main`. Blockers are
   reported, never clobbered.
2. **Non-mutating / CI-safe:** dry-run/verify never change the tree; a clean checkout ⇒ `ready`, exit 0.
3. **Reversible:** the emitted recipe preserves working bytes and includes an instant rollback (never
   force-pushes main).
4. Holds (documented keep-dirty) are never blockers.

## Enforced root
`.github/workflows/baseline-cutover.yml` runs the spec (hard gate) + the dry-run (advisory), making
`scripts/baseline-cutover.js` ENFORCED (enforcement-wiring-audit) with a sibling spec + registry entry.

## Not in scope
The live re-park EXECUTION (the carve-out) — gated on dry-run-ready + guard self-tests + human go/no-go.
This tool ships the safety rails and recipe; it does not itself Close ticket-3801/ticket-3818.
