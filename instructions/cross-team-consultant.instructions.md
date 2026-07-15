# Cross-Team Consultant Pickup Protocol (#1305)

When an Epic requires a Consultant signed by a team other than the Manager team (e.g., SOX/DORA/ISO 27001 regulatory baselines), use this protocol — not a copy-pasted prompt.

## Triggering closeout request (Manager side)

When posting a `CONSULTANT_EPIC_CLOSEOUT`-pending comment on an Epic that needs cross-team consultant:

1. Apply label `consultant:cross-team-needed` to the Epic.
2. Comment must include `## Cross-team Consultant required` heading and a canonical evidence anchor: PR/issue links + Per-AC table + rubric prerequisites.

That label is the queue marker; receiving-team skills filter on it.

## Pickup (receiving-team side)

Trigger phrases (auto-discovered via `cross-team-consult-pickup` skill):

- `cross-team consult #N`
- `find cross-team work`
- `pull cross-team`

The skill calls `scripts/global/cross-team-queue.js --my-team auto` which:

1. Resolves caller team from `inventory/team-model-signatures.json` (substrate-derived per Cross-Team R&D Protocol v2 §3 — never hard-coded).
2. Lists Epics labeled `consultant:cross-team-needed` whose Manager-of-record team ≠ caller team.
3. For each candidate, scans comments for existing `CROSS_TEAM_CLAIM`.
4. If candidate is unclaimed: emits `CROSS_TEAM_CLAIM` comment (substrate, alias, 24h expiry) AND swaps label `:needed` → `:in-progress`.
5. Re-reads comments after ~5s; if another team's earlier-timestamped claim exists, posts `CROSS_TEAM_CLAIM_YIELD` and aborts.

## Claim semantics

```
CROSS_TEAM_CLAIM: substrate=<caller>, alias=<caller-vale-alias>, expires=<UTC+24h>
```

Yield (loser of race):

```
CROSS_TEAM_CLAIM_YIELD: substrate=<caller>, deferred-to=<winner-substrate>
```

Expiry (stale-claim reaper — daily cron, AC8 deferred — see follow-up):

```
CROSS_TEAM_CLAIM_EXPIRED: expired-at=<UTC>; label reverted to :needed
```

## Signer rules

The receiving team's Consultant alias signs `CONSULTANT_EPIC_CLOSEOUT`. The signer-substrate gate (AC6 deferred — see follow-up) will enforce that the closeout signer's `Team&Model` substrate matches the active CLAIM substrate.

## Generic-only labels (G5 Portability)

The label vocabulary is team-agnostic by design:

- `consultant:cross-team-needed` (queue)
- `consultant:cross-team-in-progress` (claimed)

Adding a 4th team requires zero changes to labels, skills, scripts, or workflows — only a `inventory/team-model-signatures.json` registry entry.

## Parallel-PR duplicate-work scenario (#1473)

When two PRs reference the same child ticket, the workflow compares Team&Model identity first and falls back to GitHub login only when no Team&Model field is present:

1. Workflow `cross-team-pr-parallel-check.yml` fires on `pull_request` opened/synchronize.
2. Extracts issue refs from PR body and resolves Team&Model from PR body or commit trailers (`Team&Model:` / `AI-Team-Model:`).
3. If a same-human but different-Team&Model PR is found, it posts an advisory comment on the PR and applies `coordinator:cross-team-needs-hand-off` to the shared issue(s).
4. Operator should add `Coordinates #N` to PR bodies if work is intentionally divided, or close the duplicate and consolidate.

This is advisory only — neither PR is blocked from merging.

## Sibling-child role-label conflict scenario (#1474)

When an Epic child issue receives `role:collaborator`, `role:admin`, or
`role:consultant`, workflow `cross-team-edit-warn.yml` also evaluates open
sibling children under the same parent Epic (`- Epic: #N` body marker).

If a sibling has the same role label with a different team/owner, the workflow
posts an advisory comment and applies `coordinator:cross-team-needs-hand-off`.
Manager should coordinate ownership or split scope with `Coordinates #N`.

## See also

- `.claude/commands/cross-team-consult-pickup.md` — pickup skill
- `scripts/global/cross-team-queue.js` — queue resolver
- `inventory/team-model-signatures.json` — substrate-to-team registry
- `research/cross-team-rd-protocol-v2-2026-05-09.md` §3 — substrate-first identity pattern
- `.github/workflows/cross-team-pr-parallel-check.yml` — PR-parallel detection (#1473)
