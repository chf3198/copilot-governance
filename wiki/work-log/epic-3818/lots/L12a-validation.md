# Epic #3818 — Lot L12a (scripts · everything-else, a–m shard) Validation

**Lot:** L12a — `^scripts/` minus L6–L11 clusters, basename first-letter **a–m** · **Branch:** `feat/3818-L12a-capture` · **Base:** `origin/main` (1b2af1a)
**Disposition:** faithful, content-only capture. Nothing held/discarded.

## Segment research (2025–2026, $0 web pass)

The long-tail tooling (token, github, ide, tavily, stress, sensors, telemetry, event-schema, redaction,
accountable-team, …). Grounded in secret/token hygiene best practice: **never hardcode credentials**,
fine-grained **least-privilege** scopes with expiry, `.env`+`.gitignore` runtime loading, rotation.
Capture is faithful; no hold/discard candidates. Sources: GitHub Docs keeping-your-api-credentials-secure ·
gitguardian secrets-api-management · stepsecurity GITHUB_TOKEN.

## Shard boundary (disjoint + total with L12b)

L12 catch-all = `^scripts/` and NOT matched by L6–L11 selectors. Split by **basename first letter**:
**L12a = a–m** (this lot), **L12b = n–z + non-alpha**. Provably disjoint (a file's first letter is in
exactly one half) and together total L12.

## Capture result

- **Manifest** (`-uall`): **185 file-level entries** (0 directories).
- **cmp vs canonical source:** 185/185 **cmp-clean, 0 mismatches**.
- **Staged (exact manifest paths):** **185 files** = 177 new (`A`) + 8 modified (`M`), **0 deletions**;
  staged == manifest (**EXACT**). 179 `.js`, 4 `.sh`, 1 `.json`, 1 `.md`.
- **8 modified:** 7 faithful **mode-only** `644→755` flips (consistent with the wholesale-755 canonical
  state — see L5 mode note) + **1 genuine content drift** `accountable-team-verify.js`.
- `rollback/L12a.pre.patch` — the 8 modified files' diff.

## Rollback compensator (written BEFORE capture)

- `rollback/L12a.manifest` (185) · `rollback/L12a.pre.patch`.
- Pre-merge: `gh pr close` + delete branch + claim. Post-merge: `git revert -m 1 <sha>` PR.

## Test gate — GREEN

- `node --check` 179/179 · `bash -n` 4/4 · JSON OK · `.md` non-empty.
- Lot self-test — `accountable-team.spec.js` **PASS**.
- **CI secret-scan parity** — 0 hits across all 5 patterns (AWS/OpenAI/GitHub-PAT×2/Slack), staged + repo-wide.
- Content-only assertion — staged only `scripts/**` (L12a subset) + `epic-3818/` docs; no strays; no deletions.
- `governance-verify` — **PASS**. `validator-discipline` — **OK**. `enforcement-wiring-audit` — exit 0
  (advisory; 415 UNWIRED = faithful operational-CLI state).

## Cross-family consensus

- **Receipt:** `2d25ee14b59bcb8e` · **consensus: PASS** — **meta** (groq) PASS, **mistral** PASS.

## Holds / discards / follow-ups

- None held/discarded. Same advisory wire/retire follow-up class as other script lots (operational CLIs).
