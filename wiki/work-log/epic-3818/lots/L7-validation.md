# L7 (scripts · governance + lint) — Capture Validation

**Epic:** #3818 · **Lot:** L7 · **Selector:** `^scripts/(governance|lint|label|friction)-`
**Branch:** `feat/3818-L7-capture` · **Consensus receipt:** `4e8ade1968206148` (PASS)
**Disposition:** faithful, content-only capture. 45 captured · 2 no-op · 1 HOLD.

## File set (48 drifted paths in selector)

| Disposition | Count | Notes |
|---|---|---|
| **CAPTURE** (new on main) | 45 | governance-* (30), lint-* (8), label-* (5: incl `label-manifest.json`), friction-* (4) |
| **NO-OP** (byte-identical to origin/main) | 2 | `friction-event.js`, `label-lint-close-protection.js` — already faithful; mode-only 100755→100644 reset to match main's tracked mode, so they produce **zero diff** |
| **HOLD** (excluded) | 1 | `governance-verify.js` — see below |

Effective PR diff = **45 new files** + 2 rollback compensator files under `wiki/work-log/epic-3818/rollback/`.

## HOLD — `scripts/governance-verify.js`

The canonical checkout's on-disk copy is the **stale 120-line** version (top-level script, `path.resolve(__dirname,'..','..')` root, non-presence-tolerant merge-queue check). origin/main already carries the **superseding 328-line** refactor from #3803 (exported `verify(root)`, presence-tolerant, `__dirname/..` root) + #3804 telemetry wiring + #3800 advisory wiring. Capturing the disk copy would **revert** those live improvements and break the #3802 wiring audit — a discard-by-capture regression. Therefore **held** (do not overwrite main's superior version).

- **Follow-up F1 (proposed):** refresh the canonical checkout's stale `governance-verify.js` on-disk copy to match origin/main (relates #3801 AC4 clean-cutover). Not fixed inline — capture lot is content-only.

## Segment research (2025–2026, $0 web pass)

Governance/lint = policy-as-code validators. Current best practice = **advisory→soft-mandatory→hard-mandatory** staged rollout (measure blast radius before enforcing). The captured validators match this exactly (all advisory-first / non-blocking; `enforcement-wiring-audit` #3802 gates promotion). Regex heuristics (magic-number / function-length / `GOV-\d{3}` token scans) are acceptable for lexical/structural checks; 2025 research favors AST for deeper semantic accuracy — a potential future upgrade, **not** a discard reason. **No DISCARD candidates.**

Sources: pulumi.com/what-is/what-is-policy-as-code · spacelift.io/blog/policy-as-code-tools · eslint.org no-magic-numbers · arxiv.org/html/2601.19106v1 (deterministic AST analysis).

## Test gate — GREEN

| Check | Result |
|---|---|
| `node --check` (43 new .js) | 0 failures |
| `label-manifest.json` JSON.parse | valid |
| `governance-verify.js` | **PASS** (0 tickets); only non-blocking advisories on `3807.md` (L8 ticket, not this lot) |
| `validator-discipline.js --base origin/main` | **OK** — no unguarded validators in changeset |
| `enforcement-wiring-audit.js` | exit 0 — advisory-first (#3802); lists captured validators "reachable from no enforced root" (expected: freshly-captured, unwired) |
| Content-only assertion | staged diff = 45 `A scripts/` + 2 rollback files; no stray hunks |

### Captured governance-*.spec.js (4) — pre-existing baseline failures, NOT capture defects

`governance-adapter-emit.spec.js` (2 pass/1 fail), `governance-generate.spec.js` (0/4), `governance-manifest-validate.spec.js` (0/3), `governance-parity.spec.js` (0/5) fail **identically on the canonical checkout** (proven side-by-side). Causes: (a) captured code uses `path.resolve(__dirname,'..','..')` → resolves ROOT to `$HOME`, so `tests/fixtures/…` and `generated/…` are looked up outside the repo; (b) cross-lot deps (`instructions/*.instructions.md` = **L2**, not yet merged). Byte-faithful capture introduces **zero new breakage** — captured as-is per the "hold-don't-fix" rail.

- **Follow-up F2 (proposed):** correct the `../..`→`$HOME` root-resolution quirk across ~13 governance scripts (governance-generate/manifest-validate/parity/adapter-emit et al.); #3803 fixed only `governance-verify.js`. Behavioral change → out of scope for capture.
- **Follow-up F3 (proposed):** wire the 45 captured L7 validators into a workflow/hook/registry or retire (advisory-first #3802 promotion path). Out of scope for capture (faithful snapshot only).

## Rollback compensator

- `wiki/work-log/epic-3818/rollback/L7.manifest` — 48 drifted paths (status-porcelain form).
- `wiki/work-log/epic-3818/rollback/L7.pre.patch` — empty (all L7 paths untracked on canonical; pre-state = absent-on-main → revert = drop branch pre-merge, or `git revert -m 1 <merge-sha>` post-merge). Canonical checkout never mutated.

## Consensus

`cross-family-consensus.js --ticket 3818 --kind review` → **PASS**, receipt `4e8ade1968206148`, families **meta** (groq) + **mistral** (2 distinct non-Anthropic).
