# Epic #3818 — Manager Scope 🎯

**Title:** Parallel drift-remediation of the #3801 live-harness baseline (multi-session coordination)
**Type:** epic · **Area:** governance/hooks/tooling · **Priority:** P1 · **Points:** 21
**Parent:** operator directive 2026-07-15 · executes: #3801 (AC2–AC5) · relates: #3797, #3026, #3810, #3811

## Objective

Optimally remediate the ~764-path live-harness baseline drift on the canonical checkout by having
**multiple parallel sessions safely divide and conquer** — capture-as-baseline (never discard, per
#3801) into `origin/main`, one disjoint **lot** at a time, each with segment-specific web research,
cross-family consensus, frequent testing, and a sturdy rollback. When all lots are captured the
canonical checkout's tracked tree is clean and the Stop-hook false-positive class loses its fuel.

## Why a coordination system (not one big PR)

764 files across scripts/hooks/instructions/skills/agents is too large + too risky for one session or
one PR. The safe shape is **many small, independently-mergeable, disjoint lots** worked in parallel.
That requires exactly three guarantees — and nothing more (keep it simple):

1. **No two sessions touch the same file** → partition into disjoint lots (glob-defined; provably
   non-overlapping + total).
2. **No two sessions claim the same lot** → atomic claim via the **git remote** (pushing a claim
   branch is atomic; first push wins). No shared mutable ledger to contend on — git *is* the lock.
3. **Any failure is reversible** → capture is a faithful, idempotent content snapshot (re-runnable,
   `cmp`-clean); rollback = drop branch / `git revert` merge; a pre-capture patch is the compensator.

Grounded in current practice (see COLLAB.md §Research): work-stealing claim protocols, saga
compensating-transactions with idempotent forward+compensate steps, and git-remote-as-coordination.

## Deliverables of THIS (Manager) pass — the system, not the remediation

- `epic-3818/COLLAB.md` — the collaboration protocol (claim → research → capture → test → consensus →
  PR → rollback → done). The "simple system."
- `epic-3818/lots.md` — the 12-lot manifest: each lot's exact `git`-computable file set, risk tier,
  and per-segment research topics. Provably disjoint + total.
- `epic-3818/session-prompt.md` — the copy-paste prompt for a fresh parallel session.
- `wiki/work-log/tickets/3818.md` — mirror.
Landed via PR to `origin/main` so every parallel session reads the same source of truth.

## Acceptance criteria (Epic-level; children = lots)

- [ ] AC1 Drift partitioned into disjoint, glob-defined lots that are provably non-overlapping and
      together cover 100% of the 764-path drift (coverage + disjointness check commands included).
- [ ] AC2 Atomic, contention-free claim mechanism (git-remote claim branch, first-push-wins) with a
      stale-claim reclaim rule (TTL by commit time).
- [ ] AC3 Every lot is captured **faithfully** (content-only, `cmp`-clean, no behavioral edits) via
      its own branch → PR → CI-green → squash-merge, referencing #3818.
- [ ] AC4 Every lot passes a **test gate** BEFORE PR (py_compile / node --check, governance-verify,
      validator-discipline, enforcement-wiring-audit, lot self-tests) and its diff is content-only.
- [ ] AC5 Every lot's capture-vs-hold-vs-discard plan is ratified by **$0 cross-family consensus**
      (≥2 distinct non-Anthropic families) with a recorded receipt before merge.
- [ ] AC6 **Rollback drill**: each lot records a pre-capture snapshot patch; a documented revert path
      (pre-merge: close+delete; post-merge: `git revert` PR — never force-push main) is proven once.
- [ ] AC7 On completion: canonical checkout `git status` is clean for all captured files; a recurrence
      sentinel (#3801 AC5) is wired advisory-first; Epic close cross-family unanimous.

## Hard safety rails (non-negotiable — from #3801)

- **NEVER discard** by default. No `git reset --hard`/`git clean` on the canonical checkout. The drift
  is running security-guard logic; deletion silently reverts live guards.
- **Capture is read-only on the canonical checkout**: sessions COPY drifted content into their OWN
  worktree off `origin/main`, verify `cmp`-clean, and commit there. Do NOT mutate the shared checkout
  during capture (making its `git status` clean is a separate, final step — #3801 AC4).
- **One lot = one branch = one PR** referencing #3818. Never bundle lots. Never touch another lot's files.
- **Hold, don't fix**: if captured logic looks wrong, capture it faithfully and file a follow-up — do
  not edit behavior inside a capture PR (keeps the diff content-only + reviewable).

## Scope (out)

- Not re-writing any captured logic (faithful snapshot only). Not the #3810/#3811 gate fixes. Not
  cross-harness propagation. The final "make canonical checkout clean" cutover is the last child.

**Baton → parallel Collaborator sessions** (each claims a lot via COLLAB.md).
