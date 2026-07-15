# Review-Independence Gate Promotion Criteria (Epic #1612)

Closes the Epic #1568 self-anneal contract: advisory-first review-independence
gates either promote to required via replay-eval evidence, or carry explicit
advisory-permanent rescope language. No calendar-day soak.

## Replay-eval as the promotion gate (per Epic #1771)

Both `model-diversity-advisory` and `consultant-second-opinion-advisory`
remain advisory; promotion to required is replay-eval-gated, not time-gated:

| Gate | Promotion criterion | Tooling | Current evidence (#1612) |
|---|---|---|---|
| model-diversity | FP-rate ≤ 10% on ≥30 evaluated PRs from last 50 merged | `scripts/global/model-diversity-replay-eval.js` | 97.3% FP across 37 evaluated → STAY_ADVISORY |
| consultant-second-opinion | SECOND_OPINION-present-rate ≥ 50% on ≥20 evaluated | `scripts/global/second-opinion-replay-eval.js` | 0% present-rate across 37 → STAY_ADVISORY + ship runner |

Replay-eval re-runs on demand: `npm run governance:review-promotion-eval`. No
fixed re-evaluation cadence — re-run when the underlying workflow changes
materially (operator-count, cross-team adoption, runner availability).

## Why model-diversity stays advisory-permanent

The current rule (`scripts/global/baton-team-model.js`) checks Team&Model
literal equality. Single-operator workflows necessarily use one Team&Model
across all 4 baton phases (e.g. `claude-code:opus@local`). The 97.3% FP-rate
is the rule working correctly against a workflow where cross-team review is
not the norm — promotion would block every solo-operator PR.

The long-term path is cross-team review on every PR (Manager from one team,
Collaborator from another). Until that's the operating model, model-diversity
is informative-not-blocking. The advisory comment now states this explicitly.

## Why consultant-second-opinion stays advisory + ships a runner

0/37 historical PRs included a SECOND_OPINION block. The #1573 helper was
pure-parse — nothing actually ran a cross-family rater. Promoting to required
without a runner would have been retroactively blocking every closed PR.

`scripts/global/second-opinion-runner.js` (this Epic) invokes
`qwen2.5-coder:32b` on the `fleet-large` tier via the HAMR-wrapped fleet shim.
Consultant invokes it before posting CONSULTANT_CLOSEOUT (advisory: SHOULD).
`second-opinion-tier3-trigger.js` auto-files a Tier-3 anneal when
`max_abs_delta > 1.0` (per Epic #1308 + `consultant-second-opinion.js`).

## Waiver protocol (both gates)

| Label | Effect |
|---|---|
| `model-diversity:waived` | model-diversity advisory skipped; rationale required in PR comment |
| `second-opinion:waived` | second-opinion advisory skipped; rationale required (e.g. fleet unreachable, lane:trivial) |

## Future promotion conditions

- `model-diversity` → required when ≥80% of merged PRs in the replay window
  show cross-team baton signing (i.e. Manager + Collaborator from different
  teams). At that point the gate's FP-rate drops naturally.
- `consultant-second-opinion` → required when ≥50% of merged PRs include a
  SECOND_OPINION block (runner adopted into Consultant phase by default).

## Composition

- Epic #1771 replay-eval pattern (40,000× compression vs. calendar soak)
- Epic #1308 Tier-3 escalation contract (auto-file on goal-failure)
- Epic #1830 (related, advisory governance hygiene)
- `instructions/role-baton-routing.instructions.md` flaw-recognition anneal
  decision contract

## Red-team evidence quality fallback (Epic #1942 / #2273)

When posting a red-team artifact to an Epic/ticket thread, use `## RED_TEAM_ANALYSIS` (or `<!-- red-team-analysis -->`) and include:
- at least one explicit file path that exists in the changed diff
- at least one concrete exploit/failure chain statement
- `out-of-scope: access-control` when the comment mentions access-control but no auth-surface files changed

If model output is generic or non-diff-grounded, do not post it directly. Route to consultant/manual synthesis first.
