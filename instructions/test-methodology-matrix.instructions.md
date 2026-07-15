# Test Methodology Matrix

Architecture drives test shape. TDD is one strategy of many; the right one is determined by surface, not ideology. Manager declares `test_strategy` per `MANAGER_HANDOFF`; `test-evidence` gate verifies the declared evidence artifact exists.

## Surface → strategy

| Surface | Strategy | Lane default |
|---|---|---|
| `scripts/global/*.js`, `scripts/*.js` (governance, signals, pure functions) | `tdd-pyramid` | code-change |
| **Concurrent / file-locking primitives** (`worktree-*`, `cross-team-lease*`, any `flock`/lock/PID-aware code) | `tdd-pyramid` + **`stress-test`** | code-change |
| **Side-effect-bearing gates** (hooks, validators that touch state, `*-gate.js`, `*-check.js`) | primary (matrix-determined) + **`stress-test`** | code-change |
| **Adversarial-input parsers** (detectors, classifiers, schema validators) | primary + **`stress-test`** (adversarial corpus) | code-change |
| **Perf-sensitive governance gates** (anything declaring an SLO / p99 budget) | primary + **`stress-test`** (perf budget assertion) | code-change |
| `cloudflare/**/*.ts` (Worker routes, schema-bearing) | `contract-test` | code-change |
| `dashboard/**/*.{js,html,css}` (UI) | `visual-regression` | code-change |
| `hooks/scripts/*.py` (Python runtime hooks) | `tdd-pyramid` (pytest) | code-change |
| `.github/workflows/*.yml` (CI/CD) | `golden-file` | code-change |
| `agents/**/*.{md,yml,json}`, `skills/**/*.md` (LLM prompts/agents) | `eval-harness` | code-change |
| `instructions/**/*.md`, `wiki/**/*.md`, `docs/**/*.md` | `drift-lint` | docs-research |
| `research/**/*.md`, ADRs | `peer-review` | docs-research |
| Single-value config (toggles, version bumps, limits) | `manual-verify` | config-only |
| Trivial (typo, formatting, link, dependency lockfile) | `none` | trivial |

### Stress applicability criteria

A surface REQUIRES `stress-test` alongside its primary strategy when ANY of:

- **Concurrency**: code runs under parallel invocation (locks, leases, registries, queue consumers)
- **State mutation**: code writes to shared state (files, registries, JSONL append, IPC)
- **Untrusted input parsing**: code processes input from external sources (PRs, comments, user prompts, fetched URLs)
- **Perf budget declared**: any module that publishes an SLO, latency target, or "should complete in N ms"

A surface does NOT require `stress-test` when ALL of:

- Pure read-only function (no IO beyond reading committed config)
- Invoked once per process lifecycle (CLI utilities, one-shot scripts)
- Trivially-bounded input (config values, version bumps, formatting fixes)
- Documentation generation with no runtime consumers

## Strategy enum (allowed `test_strategy` values)

`tdd-pyramid | tdd-trophy | contract-test | golden-file | eval-harness | visual-regression | drift-lint | peer-review | manual-verify | stress-test | none`

`stress-test` is composable — it appears as a SECOND declared strategy alongside the primary (e.g., `test_strategy: tdd-pyramid+stress-test`). Per Epic #1875, the validator parses `+`-separated strategy lists when stress applies.

## Evidence artifact per strategy

| Strategy | Required evidence in PR or issue trail |
|---|---|
| `tdd-pyramid` | New/modified `tests/**/*.spec.{js,ts}` (JS/TS) OR `tests/**/test_*.py` / `*_test.py` (pytest, when the diff also changes Python source) in PR diff; `npm test` / `pytest` green |
| `tdd-trophy` | Same as pyramid + at least one integration-flavored fixture |
| `contract-test` | Schema assertion in trail OR `tests/**/contract.spec.*` in PR |
| `golden-file` | `tests/fixtures/**` referenced in PR OR fixture diff inline |
| `eval-harness` | Eval fixture path under `tests/eval/**` referenced |
| `visual-regression` | `VISUAL_QA_EVIDENCE` block per `visual-qa-governance.instructions.md` |
| `drift-lint` | `docs-drift-maintenance` skill output cited in trail |
| `peer-review` | `CONSULTANT_CLOSEOUT` with rubric ≥7 per `role-consultant-critique` |
| `manual-verify` | Before/after value + rationale in `ADMIN_HANDOFF` |
| `stress-test` | One of: `tests/stress-*.spec.js` file in PR diff, OR `npm run stress:*` invocation cited in `COLLABORATOR_HANDOFF` Pre-handoff verification. Stress spec MUST assert: ≥1 chaos / fault-injection path (G6) AND ≥1 p99 latency budget (G7). Canonical examples: `tests/stress-{worktree-isolation,anneal-decision,rebase-discipline}.spec.js` from Epic #1871. |
| `none` | Permitted only when lane ∈ {trivial, docs-research, docs-only, research, config-only, no-code-remediation} |

## Stress promotion model (NO calendar threshold per Epic #1771 / #1827 lesson)

- **NEW surfaces** shipped after Epic #1875 lands: stress-test required from day 0 (blocking). You're shipping new code — ship the stress with it.
- **EXISTING surfaces** (backfill list from Epic #1875 Phase 5): advisory until per-validator replay-eval reaches ≥85% precision against historical PR corpus. Promotion is replay-eval-gated, not time-gated.

This avoids the calendar-threshold anti-pattern. Velocity-relative + replay-eval calibration only.

## Objective floor classifier (advisory; #3098, Epic #1948 re-ship)

`scripts/global/test-floor-classifier.js` derives the **objective minimum floor from the changed
file set** and reconciles it against the Manager-declared `test_strategy` — closing the gap where
`test-evidence` only verifies the *declared* strategy has an artifact, never what the floor *should*
be. `reconcile(declared, changedPaths)` flags two cases: (1) a stress-triggering surface (concurrency
/ side-effect gate / adversarial parser, by path + reused `stress-surface-audit` content signals)
with no `+stress-test` declared; (2) a below-floor declaration (`none`/`manual-verify`) on a real code
surface. Run `npm run test-floor:check -- --declared <strategy> --files a.js,b.js` (or `--json`).

Ships **advisory** (`--strict` opts into a non-zero exit). Promotion to a blocking pre-merge gate is
replay-eval-gated per the model above. The matrix table here remains the authority the classifier
mirrors.

**Calibration + audit (#3105):** `scripts/global/test-floor-replay-eval.js` scores the classifier
against the labeled corpus `tests/fixtures/test-floor-corpus.json` — `npm run test-floor:replay-eval`
reports precision/recall and `promotionEligible` (precision at or above 0.85); the advisory→blocking
flip is gated on that, not a calendar. `detectDrift(samples)` reports the under-declaration drift rate
across a sample set. `auditRecord(result, {ts})` emits the versioned `test-floor-audit-v1` schema for
observability, and `TEST_FLOOR_DISABLED=1` is the rollback no-op. (Building the corpus surfaced two
real classifier fixes: nested `scripts/global/**` is a governance-script surface, and python hooks are
not flagged for missing the JS `stress-test` strategy.)

## Goal-lens justification

When matrix recommends a strategy other than `none` and Manager declares `none`, justify per goal-lens priority order (G1 Governance > G2 Quality > G3 Zero Cost > …). Justification goes in `MANAGER_HANDOFF` as a one-line note. `test-evidence` gate emits an advisory comment but does not block — Consultant authority on whether the override is acceptable.

The cross-cutting **operator autonomy** principle (Epic #3391, always-on, not a ranked goal) applies here too: pick the test strategy and resolve the override autonomously via the goal-lens / free cross-model panel — this is a reversible dev decision, never a client prompt (the client is design + UAT only).

## Soft default

Legacy / pre-rollout tickets without `test_strategy` are treated as `none`. Gate emits a Manager-warning advisory comment but does not fail the lane:trivial / docs path. For lanes requiring evidence, gate fails with link to this matrix.

## When the matrix is wrong

Open a `type:research` ticket against `area:governance` proposing the surface delta. Don't free-hand a new strategy enum value in a `MANAGER_HANDOFF` — the validator's enum is authoritative and rejects unknowns.

## References

- TDD effects mixed: small +external quality, ±productivity (ScienceDirect SLR 2025)
- Trophy (Kent C. Dodds), Diamond, Skyscraper, Crab — architecture-driven shapes (Automation Panda 2025; web.dev "Pyramid or Crab"; Medium 2026)
- LLM-authored code: TestGen-LLM-style backstop after-the-fact (Meta / Qodo, 2024–2026)
- Visual QA: `instructions/visual-qa-governance.instructions.md`
- Goal-lens: `instructions/global-standards.instructions.md`
- Schema: `instructions/role-baton-routing.instructions.md` (`MANAGER_HANDOFF` `test_strategy` field)
- Replay-eval over calendar waits: `docs/howto/soak-to-replay-translation.md` (#1809) — when writing validation prose, translate "N-day soak" language to replay-based eval per Epic #1771 infrastructure.
