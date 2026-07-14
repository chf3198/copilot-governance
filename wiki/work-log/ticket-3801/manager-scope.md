# #3801 — 39-file live-harness baseline capture · MANAGER SCOPE

> Baton role: **Manager** | Lane: cleanup (own `claim/cleanup-3801-baseline-capture`) | Branch: `cleanup/3801-baseline-capture` off `origin/main` (5c898a7)
> Mirror ticket: [wiki/work-log/tickets/3801.md](../tickets/3801.md) — no live GitHub issue (issue space caps at #5)

## Problem (paid-for correction, not re-derived)

The canonical checkout `~/copilot-governance` (parked on `feat/3026` @ `a15fe38`) carries **39 modified
tracked files** = **+2159 / −607** of *live, running* harness logic that exists on **no branch**. This is
**multi-ticket baseline drift** (pretool_guard/session_context/stop_reminder/posttool_reminders hooks,
role-baton-routing + workflow-resilience + global-standards instructions, 22 skills, 4 agent cards,
.gitignore). Prior sessions established (see memory `3026-drift-is-live-harness-baseline-not-3026`,
`git-baseline-restore-3797`):

- These 39 files are **NOT** `#3026` edits — **zero overlap** with `a15fe38`, and (verified this run)
  **disjoint** from the entire `feat/3026`-vs-`main` committed diff. Therefore for these 39 files
  `feat/3026` HEAD content **==** `main` content, so `main` is the correct capture base.
- `reset --hard` / discard is **DANGEROUS** — it would silently revert running security-guard logic
  (e.g. `pretool_guard.py` +793). The remediation is **CAPTURE-AS-BASELINE**, not discard.
- The ~724 untracked files are **NORMAL** mirror state and are **OUT OF SCOPE** for this capture.

## Scope (exactly these 39 files — see `capture-manifest.md` for the enumerated list + per-file attribution)

Capture the live working-tree content of the 39 modified tracked files onto this branch verbatim, so
the running harness logic becomes tracked baseline on `main`. **No behavioral edits** — this is a
faithful snapshot; the diff on this branch must byte-match the canonical checkout's working tree.

## Acceptance criteria

- [ ] AC1 — All 39 files' live working-tree content is committed on this branch and byte-identical to
      the canonical checkout (verified by `diff` of each file; manifest records sha of each).
- [ ] AC2 — Per-file attribution manifest (`capture-manifest.md`): each file → likely owning ticket/theme
      + one-line nature-of-change, grouped by subsystem. Best-effort forensic; unknowns marked.
- [ ] AC3 — Hermetic verification GREEN on a clean, `.git`-less archive: the captured Python hooks
      compile (`py_compile`) and the changed `scripts/*` specs (none in scope) — scope is hooks +
      docs, so hermetic check = `python -m py_compile` on the 4 hook scripts + a `git archive | tar`
      clean-tree extraction that reproduces the exact bytes.
- [ ] AC4 — Cross-family consensus (≥2 distinct families, PASS) ratifies the *capture-as-baseline*
      decision (vs discard) and that the snapshot is faithful; receipt cited.
- [ ] AC5 — PR → CI-green → merged to `main` (reversible; `main` unprotected). Mirror ticket 3801
      flipped to `status: DONE`. Claim released. MEMORY.md note added.

## Non-goals / carve-outs

- No re-parking or mutation of the canonical `~/copilot-governance` checkout (another session's shared
  live checkout; §6). Its dirtiness is documented-normal until a separate re-park step.
- No behavioral change to any captured file. No touching the 724 untracked files.
- Not a security-weakening change (faithful snapshot of already-running guards) ⇒ **reversible**,
  autonomous completion authorized (G8 autonomy-vs-escalate: reversible feature-branch push + PR + merge
  to *unprotected* main = autonomous; no retained carve-out triggered).
