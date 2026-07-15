# #3823 — Manager Scope: baseline-cutover mode-awareness + origin-ahead truthfulness

**Type:** bug/hardening · **Area:** governance/scripts · **Priority:** P1
**Refs (bare):** fixes a defect in ticket-3822 exposed by the ticket-3801 AC4 cutover attempt;
ticket-3818 closeout; design receipt 3355d17ac42b51ae.

## Problem (found during the live cutover attempt)
baseline-cutover.js reported ready=true on a CONTENT-ONLY byte-identity check (cmp), but the real
`git reset --mixed origin/main` revealed 847 files MODIFIED (exec-bit only: canonical working tree is
wholesale 100755, origin/main 100644) + 214 files "deleted" (origin/main tracks files the canonical
working tree lacks — origin advanced past the canonical during the session). The tool's dry-run was
NOT truthful: it missed mode drift and origin-ahead files, so "ready" was misleading.

## Fix (truthful oracle; still non-mutating)
Compute the cutover delta the way `reset --mixed origin/main` would, WITHOUT mutating the real repo:
populate a TEMP index from origin/main (GIT_INDEX_FILE + read-tree), then `git diff --raw` (working
tree vs temp index) + `ls-files --others`. Classify each path:
- safe (content+mode identical), modeDrift (content same, mode differs -> recipe normalizes),
  contentBlocker (content differs, not a documented hold/ancestor-safe), originAhead (origin tracks it,
  working lacks it -> recipe restores), hold (documented), untracked (working-only residual).
plan.ready becomes STRICT: true only when the recipe would yield a truly clean status
(contentBlocker==0 && originAhead==0 && modeDrift resolvable). Recipe gains mode-normalization + origin
catch-up steps. Never mutates the live checkout.

## Acceptance criteria
- [ ] AC1 pure classifier gains modeEqual + buckets modeDrift / originAhead; deterministic, unit-tested.
- [ ] AC2 divergence() uses a temp index (no real-index/HEAD mutation); matches the reset --mixed oracle.
- [ ] AC3 plan.ready strict (0 contentBlocker && 0 originAhead); modeDrift reported + recipe-normalized.
- [ ] AC4 CI-safe (clean tree -> ready, exit 0); never mutates.
- [ ] AC5 sibling spec + registry + CI green; enforcement-wiring-audit ENFORCED.
- [ ] AC6 free >=2-family cross-model consensus; receipt recorded.

## Rails
Reversible/autonomous tooling fix. Still never executes the cutover. Does NOT Close ticket-3801/ticket-3818.
