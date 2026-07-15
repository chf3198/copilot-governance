---
name: Collaborator Rebase Discipline
description: Velocity-relative rebase + conflict-prevention contract for Collaborator-phase work. NOT calendar-day thresholds.
applyTo: "**"
---

# Collaborator Rebase Discipline (Epic #1827)

## Why velocity-relative, not calendar

In parallel multi-orchestrator work (Claude Code + Copilot + Codex), trunk velocity can hit 100× human-dev levels. A "1-day-old" branch may already be 100+ commits behind main. **Calendar-day thresholds don't survive agentic velocity** (same anti-pattern Epic #1771 killed for soaks).

This contract uses **trunk-velocity-relative** metrics: `behind_commits`, `trunk_velocity`, `effective_drift = behind_commits / max(velocity, 1)`, and `ratio = behind_commits / max(commits_on_branch, 1)`.

## The 4-tier evaluator

| Tier | Behind (abs) | Velocity-normalized | Ratio | Action |
|---|---|---|---|---|
| `ok` | ≤ 3 | ≤ 1.0 hr-of-trunk | ≤ 1:1 | None |
| `advisory` | 4–10 | 1.0–3.0 hr | 1:1–3:1 | Recommend rebase before next push |
| `pre-handoff-block` | 11–30 | 3.0–8.0 hr | 3:1–10:1 | COLLABORATOR_HANDOFF blocked; rebase required |
| `re-scope` | > 30 | > 8.0 hr | > 10:1 | Manager re-scope review |

Thresholds are initial; calibration via replay-eval (Epic #1771 pattern; tracked as Phase 5 follow-on).

## Required artifacts

- **`npm run git:freshness-check`** — velocity-aware sampler. Runs as pre-push lefthook + before COLLABORATOR_HANDOFF. Fails (exit 1) at `pre-handoff-block`; fails-loud at `re-scope`.
- **`npm run git:conflict-predict`** — cross-PR file-overlap detection. Surfaces overlapping files BEFORE PR open.
- **COLLABORATOR_HANDOFF schema extension** — required fields `behind_at_handoff: <int>` + `rebase_freshness: <ISO8601>` per Epic #1745 audit-trail pattern. Closeout-schema validator emits advisory when absent (bridge mode; promotion to required gated on replay-eval evidence).

## Adaptive cadence at high velocity

When `trunk_velocity > 10 commits/hour`, pre-push rebase becomes **mandatory on every push** (not just before handoff). The freshness-check sampler emits this signal in its output.

## Opt-out

- `MEGINGJORD_REBASE_DISCIPLINE_DISABLED=1` — air-gapped operators bypass the contract.
- Bypass markers in commit messages (`[skip-rebase]`) require justification in `BLOCKER_NOTE` form.

## Composition

- Builds on `scripts/global/git-state-drift-sensor.js` (existing primitive; `GIT_DRIFT_MAX_BEHIND=5` is the `advisory`-tier floor).
- Composes with `scripts/global/cross-team-conflict-gate.js` (path-overlap detection between active leases — Epic #1604).
- Composes with Epic #1854 worktree-isolation contract (write-time enforcement; this contract is the rebase-time layer above).
- Replay-eval calibration uses `scripts/global/soak-replay-runner.js` from closed Epic #1771.

## Forbidden

- Calendar-day thresholds (any new branch-age metric MUST be velocity-relative).
- Bypassing `git:freshness-check` without `BLOCKER_NOTE` justification.
- Emitting COLLABORATOR_HANDOFF at `pre-handoff-block` or `re-scope` tier.
