# Epic #3818 — Lot L2 (instructions) Validation

**Lot:** L2 — `^instructions/` · **Branch:** `feat/3818-L2-capture` · **Base:** `origin/main` (8e4b2e2)
**Disposition:** faithful, content-only capture. Nothing held/discarded.

## Segment research (2025–2026, $0 web pass)

Validated the governance-as-prose instruction files against current best practice for LLM agent system
instructions: an **instruction hierarchy** (privileged instructions prioritized over untrusted input),
privilege control, and prompt-injection-resistant design patterns (privileged LLM coordinating a
quarantined LLM; runtime enforcement; execution isolation). The captured instruction files encode
layered governance directives consistent with this. No hold/discard candidates. Sources: arxiv
Formalizing LLM Agent Security (2603.19469) · simonwillison.net design patterns for securing LLM agents
against prompt injection (2025) · arxiv Harden LLM System Instructions vs Encoding Attacks (2604.01039).

## Capture result

- **Manifest:** 45 files (`rollback/L2.manifest`) — 37 new (`??`) + 8 modified (` M`) in the canonical
  checkout.
- **cmp vs canonical source:** 45/45 **cmp-clean, 0 mismatches**.
- **Staged:** **45 files** = 44 `.md` (incl. `*.instructions.md` governance docs) + 1
  `recurring-patterns.json`. All 45 genuinely differ from origin/main (no no-ops; the 8 modified files
  are real content drift, unlike L1's stale-HEAD no-ops).
- `rollback/L2.pre.patch` — 958-line diff for the 8 modified tracked files.

## Rollback compensator (written BEFORE capture)

- `rollback/L2.manifest` — 45-entry list. `rollback/L2.pre.patch` — 958 lines (8 modified files).
- Pre-merge revert: `gh pr close` + delete `feat/3818-L2-capture` + `claim/3818-L2`.
- Post-merge revert: `git revert -m 1 <merge-sha>` PR (never force-push main).

## Test gate — GREEN

- CI parity — `*.instructions.md` non-empty check: **0 empty** (44/44 non-empty); 0 empty staged files.
- JSON parse — `recurring-patterns.json` OK.
- Content-only assertion — staged set is only `instructions/**` + `epic-3818/` docs; no stray hunks.
- `node scripts/governance-verify.js` — **PASS**.
- `node scripts/validator-discipline.js --base origin/main` — **OK**, no unguarded validators.
- `node scripts/enforcement-wiring-audit.js` — exit 0, unchanged (28/103; L2 adds no scripts).

## Cross-family consensus

- **Receipt:** `9fcfc83f724f2174` · **consensus: PASS**
- Families (≥2 distinct non-Anthropic): **meta** (groq) PASS, **mistral** PASS.

## Holds / discards / follow-ups

- None. Faithful capture; no follow-up required (no unwired-validator advisory since L2 has no scripts).
