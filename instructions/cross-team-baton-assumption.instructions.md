# Cross-team baton assumption (#3031 C3)

When Team A parks a ticket mid-baton and Team B must complete it **without forging Team A's identity**.

## BATON_TRANSITION artifact

Post as an issue comment:

```markdown
## BATON_TRANSITION

from_team: <origin Team&Model team slug>
from_role: <manager|collaborator|admin>
to_team: <incoming team slug>
to_role: <role Team B will execute>
ticket: #N
reason: <why assumption is required>
prior_artifact: <URL or comment id of last valid origin artifact>

Signed-by: <incoming team's registry-derived alias>
Team&Model: <incoming team:model@substrate>
Role: <incoming role>
```

Rules:
1. Incoming team signs with **its own** `Team&Model` substrate — never re-sign as the origin team.
2. Subsequent baton artifacts on the ticket must use the **incoming** team's `Team&Model` unless a newer valid `BATON_TRANSITION` exists.
3. `BATON_TRANSITION` does not bypass other gates (lease, evidence-completeness, CI).

## Sign-off timeout (F-XT2)

`target_team_sign_off: pending` on `MANAGER_HANDOFF` must include `team_question_posted_at: <ISO8601>`.
If pending longer than `sign_off_timeout_days` (default 7, `config/governance-rules.yaml`), post escalation:

`escalation: sign-off-timeout` with `incident_ref` — Manager may proceed with documented override or re-post `TEAM_QUESTION`.

Signed-by: Orla Mason
Team&Model: claude-code:opus@anthropic
Role: manager
