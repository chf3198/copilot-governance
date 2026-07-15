# git_checks — porcelain parsing spec (#3821)

`detect_uncommitted_changes(cwd)` returns the working-tree paths from `git status --porcelain`, one per
entry, parsed as `line[3:]` (XY status + space, then path).

## Invariant (the #3821 fix)
Parse with `result.stdout.splitlines()` — **never** `result.stdout.strip().split("\n")`. A whole-output
`.strip()` removes the leading status space of the **first** porcelain line (a modified file's X column
is a space), shifting that line's `line[3:]` by one and corrupting the first path
(`.gitignore` → `gitignore`). The per-line `if line.strip()` guard drops blank lines.

This MUST parse identically to `session_baseline.snapshot_uncommitted` so the Stop hook's
session-attributable delta (#3820, `session_attributable_subset`) is exact — otherwise a single
mis-parsed first entry leaks past the baseline subtraction and `classify_internal_conflict` false-blocks
session end with `worktree-drift`.

## Tests
`hooks/scripts/git_checks_test.py` (hermetic, monkeypatched subprocess): first-path-not-corrupted,
all-paths-intact, matches-snapshot_uncommitted-parsing, empty/failure-safe.
