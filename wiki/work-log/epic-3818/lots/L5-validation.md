# Epic #3818 — Lot L5 (root-misc) Validation

**Lot:** L5 — not `^(scripts|hooks|instructions|skills|agents)/` (`dashboard/`, `docs/`, `openclaw/`,
`.gitignore`, `.changes/`) · **Branch:** `feat/3818-L5-capture` · **Base:** `origin/main` (e6a4776)
**Disposition:** faithful, content-only capture. Nothing held/discarded.

## Segment research (2025–2026, $0 web pass)

Validated `.gitignore` hygiene against current best practice: a single committed root file, ignore
secrets/build/temp, document patterns. The captured `.gitignore` follows this (its drift vs origin/main
is mode-only — see below). Dashboard is vanilla no-build JS/CSS static assets. No hold/discard
candidates. Sources: gitignore.pro best-practices 2025 · dev.to mastering-gitignore · git-scm gitignore docs.

## Capture result

- **Manifest** (`git status --porcelain -uall`): **108 file-level entries** (0 directories) — lots.md's
  "~5" collapsed the untracked `dashboard/` tree.
- **cmp vs canonical source:** 108/108 **cmp-clean, 0 mismatches**.
- **Staged (exact manifest paths only, not `git add -A <dir>`):** **108 files** = 106 new (`A`) +
  2 modified (`M`), **0 deletions**; staged set == manifest (**EXACT**). 73 `dashboard/js/*.js`,
  28 `css`, 1 `index.html`, 4 `.md`, 1 `.json`, `.gitignore`, `.changes/unreleased/1948.md`.
- `rollback/L5.pre.patch` — 33 lines (the 2 modified files' metadata).

## Mode note (important — decides faithfulness)

The canonical checkout is **uniformly `100755`** (a wholesale exec-bit state on that checkout). Capture
preserves the canonical mode (`install -D` copies mode), so the 2 tracked-modified files (`.gitignore`,
`docs/howto/accountable-team-schema.md`) show **mode-only** `644→755` flips with **no content diff**.
This is **faithful and required**: the Epic's AC7 goal is that the *canonical checkout* `git status`
becomes clean after the final #3801-AC4 cutover — since the canonical tree is 755, `origin/main` must
also be 755 for that status to be clean. This matches the already-merged L2/L3/L4 lots (all landed at
755) and #3801's "**normalize to the canonical index**". Normalizing to 644 would leave the canonical
755 files perpetually mode-dirty — the opposite of the goal. cmp-clean (content) is preserved throughout.

## Rollback compensator (written BEFORE capture)

- `rollback/L5.manifest` (108 entries) · `rollback/L5.pre.patch` (33 lines).
- Pre-merge revert: `gh pr close` + delete `feat/3818-L5-capture` + `claim/3818-L5`.
- Post-merge revert: `git revert -m 1 <merge-sha>` PR.

## Test gate — GREEN

- `node --check` — 73/73 `dashboard/js/*.js` OK. JSON parse OK. 4 `.md` non-empty. `index.html` DOCTYPE OK.
- Content-only assertion — staged set only L5 globs + `epic-3818/` docs; no stray hunks; no deletions.
- `node scripts/governance-verify.js` — **PASS**. `validator-discipline` — **OK**.
- `enforcement-wiring-audit` — exit 0 (advisory; L5 adds no scripts).

## Cross-family consensus

- **Receipt:** `81b023b3b9b79ae1` · **consensus: PASS** — **meta** (groq) PASS, **mistral** PASS.

## Holds / discards / follow-ups

- None. Faithful capture. Mode handling documented above for the closeout child's reference.
