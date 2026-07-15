# Epic #3818 — Lot L9 (scripts · cross + model + multi + review) Validation

**Lot:** L9 — `^scripts/(cross|model|multi|review)-` · **Branch:** `feat/3818-L9-capture` · **Base:** `origin/main` (2bf208b)
**Disposition:** faithful, content-only capture. Nothing held/discarded.

## Segment research (2025–2026, $0 web pass)

Validated the running consensus/review logic against current best practice: a **vendor-diverse panel**
of judges from multiple training pipelines outperforms any single judge and reduces intra-model bias; a
consensus rule (e.g. k-of-n) + ensemble aggregation across **model families**; order randomization,
explicit rubrics, and debiasing to resist adversarial/agreeableness bias. This is exactly the shape of
the captured `cross-family-consensus` / `multi-judge-*` / `review-*` tooling (which produced this lot's
own receipt). No hold/discard candidates. Sources: arxiv Agent-as-a-Judge (2508.02994) · arxiv Beyond
Consensus / agreeableness-bias (2510.11822) · CollabEval (2603.00993) · emergentmind LLM-as-a-Judge.

## Capture result

- **Manifest:** 40 files (`rollback/L9.manifest`) — all `??` (new/untracked) in the canonical checkout.
- **cmp vs canonical source:** 40/40 **cmp-clean, 0 mismatches**.
- **Staged:** **40 files** = 22 `cross-*`, 4 `model-*` (incl. `model-routing-policy.json`),
  5 `multi-judge-*` / `multi-model-*`, 9 `review-*`. All genuinely new vs origin/main (no no-ops).
- `rollback/L9.pre.patch` empty by design — all untracked, no tracked base to diff.

## Rollback compensator (written BEFORE capture)

- `rollback/L9.manifest` — 40-entry list. `rollback/L9.pre.patch` — empty (all untracked).
- Pre-merge revert: `gh pr close` + delete `feat/3818-L9-capture` + `claim/3818-L9`.
- Post-merge revert: `git revert -m 1 <merge-sha>` PR (never force-push main).

## Test gate — GREEN

- `node --check` — 40/40 `.js` OK.
- JSON parse — `model-routing-policy.json` OK.
- (No `*.spec.js`/`*_test.py` in lot; the `-smoke.js`/`-e2e.js` files are network-touching, so
  node --check is the syntactic gate applied — no execution side effects.)
- Content-only assertion — staged set is only `scripts/**` (L9 glob) + `epic-3818/` docs.
- `node scripts/governance-verify.js` — **PASS**.
- `node scripts/validator-discipline.js --base origin/main` — **OK**, no unguarded validators.
- `node scripts/enforcement-wiring-audit.js` — exit 0. **Advisory (non-blocking):** 75 UNWIRED — the
  captured cross/model/multi/review scripts are operational CLIs invoked directly, not enforced-root
  validators. Faithful state, captured as-is (*hold-don't-fix*). Wire/retire follow-up noted.

## Cross-family consensus

- **Receipt:** `b3a06080d252b595` · **consensus: PASS**
- Families (≥2 distinct non-Anthropic): **meta** (groq) PASS, **mistral** PASS.

## Holds / discards / follow-ups

- **Holds/discards:** none — faithful capture.
- **Follow-up (advisory, not fixed inline):** wire or retire the UNWIRED captured operational CLIs
  flagged by `enforcement-wiring-audit` (advisory-first #3802; non-blocking). Same class as L8's note;
  a single wiring/retire ticket can be raised once the full drift is captured.
