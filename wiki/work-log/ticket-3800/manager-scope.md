# Manager Scope — #3800 (reconcile-or-merge, Phase-0 advisory guard → wired + merged)

- **Ticket**: #3800 — Self-anneal: guard Epic-completion bundling drift (per-child baton traceability)
- **Branch**: `feat/3800-epic-child-baton-traceability` (pre-existing origin branch, no prior claim)
- **Role**: Manager | **Signed-by**: Curtis Franks | **Team&Model**: claude-code:opus-4.8@anthropic
- **verification-timestamp**: 2026-07-14

## Situation (why this ticket exists in "reconcile-or-merge")

`feat/3800` already carried a single clean commit (`11d2f4f`) delivering the Phase-0 advisory
detector (`scripts/epic-child-baton-traceability.js` + sibling spec, 8/8 green) but was **never
merged** and held **no claim**. A merge of the detector *as-is* would land a guard that **nothing
calls** — dead code that "reconciles to done" but never enforces (the exact anti-pattern the roadmap
step 4.iii flags E1 to burn down). So the reconcile disposition is upgraded to an **enforcement-first
completion**.

## Scope (this branch / this PR only — no bundling)

**IN scope (delivered now):**
- **AC1** — the pure `auditEpics()` detector + advisory CLI + sibling spec (already on branch; verified
  hermetic-green on a clean `.git`-less archive). Keep.
- **AC2** — **wire** the detector into `scripts/governance-verify.js` as a **default-on, non-blocking
  advisory section**, mirroring the existing `accountable-team-verify` block (env kill-switch
  `EPIC_CHILD_BATON_ADVISORY=0`; NEVER contributes to `issues`; pass/fail verdict unchanged).
- **AC6** — a `docs/howto/` note documenting the per-child baton-evidence requirement + the advisory.
- Fix cosmetic path drift in `3800.md` (`scripts/global/…` → flat-layout `scripts/…` per main reality).
- Dogfood: add this ticket's own `## CONSULTANT_CLOSEOUT` + `## GitHub Evidence Block` so #3800
  itself satisfies its own EB1/EB2 invariants.

**OUT of scope (remain OPEN as tracked Phase-1 backlog inside this Epic):**
- **AC3** — close-time remediation hint in the Manager/Admin baton path.
- **AC4** — shadow-period false-positive metric + promotion advisory→blocking (needs a soak).
- **AC5** — optional historical backfill of the ~640 pre-existing instances.

Epic #3800 therefore stays **OPEN** (honest: Phase-1 remains) but its Phase-0 charter + live wiring
land on `main`. No `status: DONE` flip that would misreport open ACs.

## Acceptance gates (verification)

- G-hermetic: `git archive <branch> | tar -x -C /tmp/ci && (cd /tmp/ci && node scripts/…spec.js)` GREEN
  on a clean, `.git`-less tree — node built-ins only, no network/untracked deps.
- G-wire: `node scripts/governance-verify.js` still exits per `issues` only; advisory count printed;
  `EPIC_CHILD_BATON_ADVISORY=0` silences it; requiring governance-verify never throws on this path.
- G-consensus: hermetic-path + wiring design ratified by a free ≥2-distinct-family cross-model panel
  (`cross-family-consensus.js`), receipt recorded (AC5-consensus of the ticket).
- G-autonomy (G8): merge to **unprotected** `main` via feature-branch PR is **reversible** ⇒ complete
  autonomously; no carve-out triggered (not protected-main/production/irreversible/security-weakening).

## Baton plan

Manager (this doc) → Collaborator (wire + tests + hermetic evidence) → Admin (PR + CI-green + merge) →
Consultant (independent closeout critique). Artifacts under `wiki/work-log/ticket-3800/`.
