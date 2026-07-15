# #3821 — Manager Scope: fix detect_uncommitted_changes first-line porcelain parse

**Type:** bug · **Area:** hooks/git · **Priority:** P2
**Refs (bare):** discovered deploying ticket-3820; ticket-3810 baseline substrate; ticket-3801 standing drift.

## Problem
git_checks.detect_uncommitted_changes runs result.stdout.strip().split(newline) then line[3:]. The
whole-output strip removes the leading status space of the FIRST porcelain line, shifting its line[3:]
by one and corrupting that one path (e.g. .gitignore -> gitignore). session_baseline.snapshot_uncommitted
uses splitlines (no whole-output strip), so the Stop baseline and the Stop uncommitted set disagree on
exactly the first entry. should_block masked it (its _code_files filter drops the non-code first item),
but the ticket-3820 session-attributable conflict path has no code filter, so the 1 mis-parsed item leaks
-> classify_internal_conflict -> worktree-drift -> false Stop block.

## Fix (1 line, root cause)
detect_uncommitted_changes: result.stdout.strip().split(newline) -> result.stdout.splitlines()
(the existing per-line if line.strip() guard already drops blanks). Parses identically to
snapshot_uncommitted; first path no longer corrupted.

## Acceptance criteria
- [ ] AC1 first porcelain entry parses with full path (.gitignore stays .gitignore).
- [ ] AC2 detect_uncommitted_changes set == snapshot_uncommitted set on the same tree.
- [ ] AC3 regression test; py_compile clean.
- [ ] AC4 free >=2-family cross-model consensus; receipt recorded.

## Rails
Pure correctness fix to a live guard; reversible; makes parsing MORE correct. Live deploy follows merge.
