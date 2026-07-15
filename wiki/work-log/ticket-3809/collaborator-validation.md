# Ticket #3809 — Collaborator Validation 🔧

**Baton received from:** Manager (scope: land free-fleet-first clause + track goal_lens hook)

## Files changed

- `hooks/scripts/goal_lens.py` — **new tracked file** (was untracked live-harness state).
  Added `FREE_FIRST` constant + appended it to the injected `base` string after `AUTONOMY`.
- `hooks/scripts/goal_tier_resolver.py` — **new tracked file** (goal_lens's sole internal
  import; unchanged content, tracked so the hook resolves on a fresh install).
- `wiki/work-log/ticket-3809/*` — baton artifacts.

## The clause (subordinate to G1/G2 by construction)

```
Free-fleet-first (G3, subordinate to G1/G2): prefer free fleet resources for every action
where one applies — before any paid inference, route to free fleet first (local Ollama /
OpenRouter-free / free cross-family panel); escalate to paid only when free is unavailable,
unreliable, or would compromise G1 Governance or G2 Quality; log the free-first decision (G8).
```

## Validation evidence

| AC | Check | Result |
|----|-------|--------|
| AC1 | Clause present + states subordination to G1/G2 | PASS |
| AC2 | `GOALS` ordering string unchanged (`G1 > G2 > G3 Zero Cost > ...`) | PASS |
| AC3 | Imports resolve with isolated empty `HOME` (no `goal-tier-state.json`) → graceful default tier | PASS (clean stderr) |
| AC4 | `python3 goal_lens.py` on sample payload → valid JSON, `additionalContext` + `goalLensTier` keys intact | PASS |
| AC5 | Required CI workflows green | see admin-handoff (run on PR) |
| AC6 | Cross-family $0 review consensus receipt | see consultant-closeout |

Command (reproducible):
`HOME=/tmp/empty python3 hooks/scripts/goal_lens.py <<< '{"prompt":"optimize the fleet"}'`

**Baton → Admin**
