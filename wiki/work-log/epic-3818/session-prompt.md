# #3818 — Parallel-session prompt (copy-paste into each new session)

Paste the block below into a fresh session. Multiple sessions can run it at once — the git-remote claim
guarantees they never collide. Each session captures one or more lots, then stops.

---

```
ROLE: You are one of several PARALLEL sessions collaboratively remediating the #3801 live-harness
baseline drift under Epic #3818. Work ONE disjoint "lot" at a time. Other sessions are working other
lots concurrently — coordinate ONLY through the git remote (never assume you're alone).

FIRST, read the source of truth on origin/main (do not skip):
  git -C ~/copilot-governance fetch origin main
  git -C ~/copilot-governance show origin/main:wiki/work-log/epic-3818/COLLAB.md   # the protocol
  git -C ~/copilot-governance show origin/main:wiki/work-log/epic-3818/lots.md     # the 12-lot menu
  git -C ~/copilot-governance show origin/main:wiki/work-log/epic-3818/manager-scope.md  # scope + safety rails
Follow COLLAB.md EXACTLY. The rails below are non-negotiable.

NON-NEGOTIABLE SAFETY RAILS:
- CAPTURE, NEVER DISCARD. No git reset --hard / git clean on ~/copilot-governance (the canonical
  checkout). Its drift is LIVE security-guard logic; deleting it silently reverts running guards.
- The canonical checkout is READ-ONLY to you. COPY drifted file content into your OWN worktree off
  origin/main, prove it cmp-clean, commit THERE. Never mutate the shared checkout.
- ONE lot = ONE branch = ONE PR, referencing #3818 (Refs, not Closes). Never touch another lot's files.
- FAITHFUL capture only: content-only snapshot, zero behavioral edits. If captured logic looks wrong,
  capture it as-is and file a follow-up ticket — do NOT fix inline.

DO THIS LOOP:
0. PICK an available lot: it has NO claim branch (git ls-remote --heads origin 'claim/3818-*') and NO
   merged PR (gh pr list --state merged --search "3818 lot: in:title"). Prefer the claim order in lots.md
   (L1 hooks first). Run the disjointness/coverage self-check from lots.md.
1. CLAIM atomically (first push wins; if it fails, the lot is taken — pick another):
     git -C ~/copilot-governance push origin origin/main:refs/heads/claim/3818-<lot>
2. RESEARCH the segment with the web (topics for your lot are in lots.md). Use cutting-edge 2025–2026
   sources to (a) confirm the running logic is current-best and (b) flag hold/discard candidates.
   This informs your capture/hold/discard JUDGMENT — not inline rewrites.
3. ISOLATE: git -C ~/copilot-governance worktree add ~/cg-3818-<lot> -b feat/3818-<lot>-capture origin/main
   then a STANDALONE `cd ~/cg-3818-<lot>` (persistent cwd — the branch-ticket guard keys off it).
4. SNAPSHOT the rollback compensator FIRST: save `git -C ~/copilot-governance diff -- <globs>` and the
   file manifest under wiki/work-log/epic-3818/rollback/<lot>.{pre.patch,manifest} (git add -f).
5. CAPTURE: copy each drifted file's content into the worktree (preserve paths); PROVE every file is
   `cmp`-clean vs the canonical source (no mismatch). git add only your lot's files.
6. TEST GATE — test early, test often; must be fully GREEN before you go further:
     py_compile / node --check / bash -n on changed files; any lot *.spec.js/_test.py; then
     node scripts/governance-verify.js ; node scripts/validator-discipline.js --base origin/main ;
     node scripts/enforcement-wiring-audit.js
     Assert the diff is content-only (only your lot's files, no stray hunks).
   If ANYTHING is red → STOP, roll back this batch (git reset --hard HEAD in the worktree; canonical
   untouched), diagnose, and only then retry. Never proceed on red.
7. CROSS-FAMILY CONSENSUS ($0, required, ≥2 distinct non-Anthropic families) on your disposition + diff:
     node ~/copilot-governance/scripts/cross-family-consensus.js --ticket 3818 --kind review \
       --summary "<lot>: faithful capture of N files; holds/discards=<list+why>; content-only, cmp-clean; tests green"
   Require consensus PASS; RECORD the receipt in your validation doc. On FAIL: address the objection or
   downgrade contested files to 'hold', then re-run. Do not merge without PASS.
8. COMMIT + PR (reference #3818 in the -m text; strip # from any other numbers):
     git commit -m "capture(#3818): <lot> baseline capture — faithful, content-only. Refs #3818"
     git push -u origin feat/3818-<lot>-capture
     gh pr create --base main --title "capture(#3818): <lot> baseline capture" --body "Refs #3818, lot:<lot>. Faithful cmp-clean capture; tests green; consensus <receipt>. Holds/discards: <list>."
   Write wiki/work-log/epic-3818/lots/<lot>-validation.md (git add -f): file list, cmp result, test
   output, consensus receipt, any holds/discards + follow-up ticket refs.
9. VERIFY CI + MERGE: gh pr checks <PR> --watch → ALL GREEN (checks register ~30s late; if an early
   merge says "checks pending", just re-check). Then gh pr merge <PR> --squash --delete-branch.
   NEVER merge red. Post-merge regression → open a `git revert -m 1 <merge-sha>` PR (never force-push main).
10. RELEASE + LOOP: git -C ~/copilot-governance push origin --delete claim/3818-<lot>. Remove your
    worktree (git worktree remove ~/cg-3818-<lot> --force; prune). Then go to 0 for the next lot, or stop.

STALE-CLAIM RECLAIM: if a claim/3818-<lot> branch has no new commits for >2h and no open PR, any session
may reclaim it: delete the stale claim branch, then claim fresh. Idempotent capture makes restart safe.

REPORT at the end: which lot(s) you captured, the merge SHAs, consensus receipts, and any holds/discards
you filed as follow-ups.
```

---

**Optional bootstrap for the very first session:** create the `rollback/` and `lots/` dirs on first use
(they are `git add -f` since `wiki/` is gitignored). The final closeout lot (canonical-checkout clean
cutover + recurrence sentinel, #3801 AC4/AC5) is claimed LAST, only after all capture lots merge, and it
`Closes #3818` and #3801.
