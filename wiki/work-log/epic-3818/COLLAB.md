# #3818 — The Collaboration System (parallel drift remediation)

A deliberately **simple** system: the git remote is the coordinator, disjoint lots are the units of
work, and every step is reversible. No new services, no shared mutable ledger, no lock daemon.

---

## The three primitives

1. **Lots** = disjoint, glob-defined slices of the drift (see `lots.md`). Two sessions never touch the
   same file because lots never overlap.
2. **Claim = an atomic `git push` of a claim branch.** `git push` of a *new* ref is atomic on the
   remote: the first session to push `claim/3818-<lot>` wins; a second push is rejected. That rejection
   *is* the mutex. No file to contend on.
3. **Reversibility** = capture is a faithful, idempotent content snapshot; every forward step has a
   compensator (drop branch / `git revert`). Re-running a capture yields byte-identical output.

## Coordination state is READ from git — never stored

- **In progress** → a `claim/3818-<lot>` branch exists: `git ls-remote --heads origin 'claim/3818-*'`
- **Done** → the lot's PR is merged: `gh pr list --state merged --search "3818 lot:<lot> in:title"`
- **Available** → a lot in `lots.md` with neither a claim branch nor a merged PR.

There is no status file to update (and therefore nothing to conflict on). Truth is derivable at any
instant from `git ls-remote` + `gh pr list`.

---

## The lifecycle (what one session does, per lot)

Each lot is a mini-saga. Forward steps are numbered; each has a compensator (§Rollback).

**0 · Pick.** List available lots (above). Choose the highest-priority unclaimed lot you're suited to.

**1 · Claim (atomic).** From the canonical repo:
```
git fetch origin
git push origin origin/main:refs/heads/claim/3818-<lot>   # FAILS if already claimed → pick another
```
Losing the race is normal and safe — just pick the next lot.

**2 · Research the segment ($0, cutting-edge).** Before capturing, run a short web-research pass on
this segment's domain (topics per lot in `lots.md`) to (a) validate the running logic reflects current
best practice and (b) flag anything that should be *hold/discard* rather than captured. You are
capturing, not rewriting — research informs the **disposition judgment**, not inline edits.

**3 · Isolate.** Never work in the canonical checkout. Create a worktree off fresh `origin/main`:
```
git worktree add ~/cg-3818-<lot> -b feat/3818-<lot>-capture origin/main
cd ~/cg-3818-<lot>            # STANDALONE cd (persistent cwd; branch-ticket guard keys off it)
```

**4 · Snapshot the compensator FIRST (safety).** Record the exact pre-capture state so any mistake is
undoable:
```
git -C ~/copilot-governance diff -- <lot-globs>  > wiki/work-log/epic-3818/rollback/<lot>.pre.patch
git -C ~/copilot-governance status --porcelain -- <lot-globs> > wiki/work-log/epic-3818/rollback/<lot>.manifest
```

**5 · Capture (faithful, idempotent).** Copy each drifted file's content from the canonical checkout
into the worktree, preserving paths. Then PROVE it is a content-only snapshot:
```
for f in $(cut -c4- wiki/work-log/epic-3818/rollback/<lot>.manifest); do
  install -D ~/copilot-governance/"$f" ./"$f"
  cmp -s ~/copilot-governance/"$f" ./"$f" || echo "MISMATCH $f"   # must print nothing
done
git add -A <lot-globs>
```
No behavioral edits. If logic looks wrong → capture as-is + file a follow-up ticket (do not fix here).

**6 · TEST GATE (must be green — test early, test often).** Run after every capture batch, and in
full before the PR:
- `python3 -m py_compile <changed .py>` · `node --check <changed .js>` · `bash -n <changed .sh>`
- lot self-tests (any `*.spec.js` / `*_test.py` in the lot)
- `node scripts/governance-verify.js` · `node scripts/validator-discipline.js --base origin/main`
  · `node scripts/enforcement-wiring-audit.js`
- **Content-only assertion**: `git diff --cached` shows only the captured files; no unrelated hunks.
If anything is red → **STOP, roll back this batch (§Rollback), diagnose** before continuing.

**7 · CONSENSUS GATE ($0 cross-family).** Ratify the capture/hold/discard disposition + the diff:
```
node ~/copilot-governance/scripts/cross-family-consensus.js --ticket 3818 --kind review \
  --summary "<lot>: faithful capture of N files (list holds/discards + why); content-only, cmp-clean; tests green"
```
Require **consensus PASS** (≥2 distinct non-Anthropic families). Record the receipt. If FAIL →
address the panel's objection or downgrade contested files to *hold*; re-run.

**8 · Commit + PR.** Commit referencing **#3818** in the `-m` text (strip `#` from any other numbers).
```
git commit -m "capture(#3818): <lot> live-harness baseline (faithful, content-only). Refs #3818"
git push -u origin feat/3818-<lot>-capture
gh pr create --base main --title "capture(#3818): <lot> baseline capture" --body "...Refs #3818, lot:<lot>..."
```
Do **not** write "Closes #3818" (that's only the final closeout child). Use `Refs #3818, lot:<lot>`.

**9 · Verify CI + merge.** `gh pr checks <PR> --watch` → all green (checks register ~30s late; an early
merge says "checks pending" — just re-check). Then `gh pr merge <PR> --squash --delete-branch`.

**10 · Release the claim + record done.** `git push origin --delete claim/3818-<lot>`. The merged PR is
the durable "done" record. Append one line to `epic-3818/progress.log` in your PR (each lot writes its
own line → different content, low conflict; if it conflicts, rebase and re-append — trivial).

Then loop to step 0 for the next lot, or stop.

---

## Rollback (the compensators — the failure path matters as much as the happy path)

| Failure detected at | Compensating action (idempotent) |
|---|---|
| Test gate (step 6) red | `git reset --hard HEAD` in the worktree (safe — worktree only), re-capture from the `.pre.patch` baseline. Canonical checkout untouched. |
| Consensus FAIL (step 7) | Do not merge. Downgrade contested files to *hold* (remove from this lot), or abandon: `gh pr close`, `git push origin --delete feat/3818-<lot>-capture` + `claim/3818-<lot>`. |
| CI red (step 9) | Same as consensus fail — never merge red. |
| **Post-merge regression** | **Never force-push main.** Open a revert PR: `git revert -m 1 <merge-sha>` → PR → merge. The `.pre.patch` reproduces the exact prior state for re-work. |
| Session dies mid-lot | Claim branch goes stale (no new commits > **2h**). Any session may reclaim: confirm no open PR, `git push origin --delete claim/3818-<lot>`, then re-claim. Idempotent capture means restarting is safe. |

Because capture is a deterministic content snapshot, **every operation is safe to retry** — the core
idempotency guarantee that makes parallel + rollback sound.

---

## Guardrail checklist (per lot, before merge)

- [ ] Worked in an isolated worktree — canonical checkout never mutated.
- [ ] `.pre.patch` compensator written before capture.
- [ ] `cmp`-clean vs source for every file; diff is content-only (no behavioral edits).
- [ ] Only this lot's globs touched; no overlap with another lot.
- [ ] Test gate fully green; segment research done; holds/discards justified.
- [ ] Cross-family consensus PASS + receipt recorded.
- [ ] Commit/PR reference `#3818` (no foreign `#` refs); `Refs`, not `Closes`.

---

## Research grounding (2025–2026)

- **Work-stealing / atomic claim** — independent tasks in local queues; an *atomic claim protocol* lets
  only one worker own a unit (optimistic locking). We use the git remote's atomic ref-push as the lock.
  (arxiv 1012.5030; developersdigest multi-agent coordination.)
- **Saga / compensating transactions** — no distributed rollback; each forward step needs a *tested,
  idempotent compensator*; use an idempotency key per step; **test the failure path as rigorously as
  the happy path**; keep an audit log. (microservices.io/patterns/data/saga; temporal.io saga guide;
  dasroot.net 2025.)
- **Idempotency / at-least-once** — retry transient, compensate on permanent; re-running a step must be
  a no-op if already applied. Our capture is content-deterministic (`cmp`-clean), so it is idempotent by
  construction. (freecodecamp saga in Node; conduktor saga glossary.)

Sources: arxiv.org/pdf/1012.5030 · developersdigest.tech/blog/how-to-coordinate-multiple-ai-agents ·
microservices.io/patterns/data/saga.html · temporal.io/blog/mastering-saga-patterns · conduktor.io
saga glossary.

---

## Field notes (from live L1–L10 runs) — read before your first lot

Hard-won gotchas that are NOT obvious from the happy-path steps above. Each cost a real session cycles.

1. **Classify every drifted path — capture is not the only disposition.** Some paths that show as
   `??` untracked on the canonical checkout (which sits on `feat/3026-…`, NOT main) *already exist on
   `origin/main`*. For each such file: byte-identical → **no-op** (produces no diff, fine); differs and
   the disk copy is **older/stale** → **HOLD** (do NOT overwrite main's superior version — that is a
   discard-by-capture regression). Decide with:
   `git cat-file -e origin/main:$f && git show origin/main:$f | cmp -s - <canonical>/$f`.
   Real example: `governance-verify.js` disk copy was a stale 120-line version; main's 328-line
   refactor superseded it → held, follow-up filed.

2. **`progress.log` conflicts on EVERY rebase — resolve by UNION, never `--theirs`.** All lots append
   to it, so parallel merges collide. `git checkout --theirs` (or `--ours`) silently drops the other
   lots' lines. Rebuild the file as the union: `git show origin/main:…/progress.log` + your one lot
   line. (`wiki/` is gitignored, so `git add wiki/...` prints "ignored" — but an already-tracked file's
   edit still commits; use `git add -f` for new wiki files.)

3. **`git diff origin/main..HEAD` lies once main advances (phantom `D`).** Other sessions merge fast;
   files a *newer* main added appear as fake deletions in your branch. Verify your ACTUAL change against
   your commit's own parent: `git diff --name-status HEAD~1..HEAD` (should be all `A` + the one
   `progress.log` `M`). Rebase onto latest, union-resolve, and **merge immediately** before the next lot
   lands.

4. **Mode drift breaks the content-only assertion.** `install -D` copies the canonical `+x` bit, so
   files land `100755`. For files already tracked on main at `100644`, reset the mode
   (`chmod 644` + re-add) so they drop from the diff. New shebang/executable scripts staying `755` is
   faithful; a data file (e.g. `*.json`) captured `755` is harmless but note it.

5. **Captured `*.spec.js` may be RED for reasons that are NOT your capture.** Cross-lot deps
   (`instructions/*` = L2) not yet merged, and pre-existing `path.resolve(__dirname,'..','..')`→`$HOME`
   root-resolution bugs, make some specs fail. Prove it is baseline behavior by running the same spec
   against the canonical checkout — identical failure ⇒ faithful capture, proceed + file a follow-up.
   The **blocking** gates are governance-verify / validator-discipline / enforcement-wiring-audit + the
   real CI workflows; those must be green.

6. **The Stop hook will block on the standing baseline drift (known false-positive).**
   `classify_internal_conflict` (client_arbitration_guard.py) is NOT #3810-baseline-aware, so it fires
   `worktree-drift` on the pre-existing #3818 drift you are forbidden to touch. Its own policy is
   "preserve-first … continue **without** client arbitration." Your session's own work is already
   committed+merged, so evaluate from a clean cwd (the Stop hook reads `git status` in the session cwd;
   a non-repo dir like `~` yields an empty uncommitted list → `type=none`). Do NOT revert/commit the
   canonical drift to clear it — that violates capture-never-discard. Log evidence and move on.
