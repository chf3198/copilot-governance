# Epic #3818 — Lot L3 (skills) Validation

**Lot:** L3 — `^skills/` · **Branch:** `feat/3818-L3-capture` · **Base:** `origin/main` (b836c93)
**Disposition:** faithful, content-only capture. Nothing held/discarded.

## Segment research (2025–2026, $0 web pass)

Validated the skill packages against current best practice: **progressive disclosure** (name+description
first, full instructions when relevant, resources on demand), **skill routing** (retrieve-and-rerank;
full skill text is a critical routing signal — hiding it drops routing accuracy 31–44pp), and capability
scoping (a skill is a reusable operational package specifying activation conditions + procedure without
necessarily expanding the primitive action space). Agent Skills is now an open standard (Dec 2025). The
captured `SKILL.md`-based packages align. No hold/discard candidates. Sources: arxiv SkillRouter
(2603.22455) · swirlai Agent Skills / progressive disclosure · arxiv Agent Skills for LLMs (2602.12430).

## Capture result

- **Manifest granularity fix:** lots.md's "~39" counted `git status` **collapsed untracked directories**.
  Regenerated the manifest with `git status --porcelain -uall` → **43 file-level entries** (0 directory
  entries), still exactly the `^skills/` glob (disjoint from all other lots).
- **cmp vs canonical source:** 43/43 **cmp-clean, 0 mismatches**.
- **Staged:** **43 files** = 21 new (`A`) + 22 modified (`M`), **0 deletions**. Staged set diff vs
  manifest is empty (**EXACT MATCH**). 42 `.md` (incl. `SKILL.md`) + 1 `watchdog-snapshot.sh`.
- **Capture-safety note:** an initial `install -D` hit collapsed-dir manifest entries and a stray
  `rm -rf skills/` briefly staged 19 spurious deletions of origin/main's tracked skills. Corrected by
  **restoring the full origin/main skills tree (`git checkout HEAD -- skills/`) then overlaying only the
  43 drifted files** — final diff is content-only with no deletions. Canonical checkout never touched.

## Rollback compensator (written BEFORE capture)

- `rollback/L3.manifest` — 43-entry file-level list. `rollback/L3.pre.patch` — 1329 lines (22 modified).
- Pre-merge revert: `gh pr close` + delete `feat/3818-L3-capture` + `claim/3818-L3`.
- Post-merge revert: `git revert -m 1 <merge-sha>` PR.

## Test gate — GREEN

- File-type validation — 42 `.md`; `watchdog-snapshot.sh` `bash -n` OK.
- `SKILL.md` non-empty (CI parity) — **0 empty**.
- Content-only assertion — staged set only `skills/**` + `epic-3818/` docs; no stray hunks; no deletions.
- `node scripts/governance-verify.js` — **PASS**.
- `node scripts/validator-discipline.js --base origin/main` — **OK**.
- `node scripts/enforcement-wiring-audit.js` — exit 0, unchanged (28/103; L3 adds no scripts).

## Cross-family consensus

- **Receipt:** `c3b442e90fcaab89` · **consensus: PASS**
- Families (≥2 distinct non-Anthropic): **meta** (groq) PASS, **mistral** PASS.

## Holds / discards / follow-ups

- None. Faithful capture.
- **Process note for later lots (L12 etc.):** always build manifests with `git status --porcelain -uall`
  when a lot may contain wholly-untracked directories, and **never `rm -rf` a lot dir** that origin/main
  already tracks — restore-then-overlay instead, to avoid spurious deletions.
