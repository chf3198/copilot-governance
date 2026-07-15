---
name: Workflow Resilience
description: Always-on rules for self-annealing after failures, documentation drift detection, and process hardening. Distilled from workflow-self-anneal and docs-drift-maintenance skills.
applyTo: "**"
---
# Workflow Resilience

## Self-annealing triggers

Run `workflow-self-anneal` skill when any of these conditions is true:
- Same failure pattern appears at least twice in the last 7 days.
- Session had crash, restart, or tooling instability.
- Instructions were contradicted by observed actions.
- Pre-merge gate requires process hardening evidence.
- Repeated carryover or blocked items across iterations.
- PR review or merge latency repeatedly breaches targets.
- Reopened issues or defects trend upward.
- Ticket/epic local markdown state diverges from observable GitHub issue/PR evidence.
- Any P0/P1 ticket remains `status:ready` for more than 24h without a blocker note.
- Governance-gate bypass env var (e.g. `SKIP_CLOSEOUT_PREFLIGHT`, `PUSH_GATES_BYPASS`) used 2+ times in the same session — triggers an immediate Tier-2 anneal that promotes the underlying bug-fix to first-work in the current session. Tracked by `scripts/global/session-bypass-tracker.js`.
- Tool-block emission (sandbox denial, hook deny, classifier deny) followed by session termination within 1 turn — Tier-2 trigger. The tool-block is redirect guidance, not a terminal state; the right adaptation is documented in operator-local memory `feedback-bash-sleep-block-recovery` (Pattern A; #2116). Surfaced after PR #2113 cycle stalled on `sleep N && cmd` sandbox block.
- Background-task dispatch (`Bash run_in_background: true`, scheduled wake) followed by user-visible closing text without a follow-up tool call — Tier-2 trigger. Dispatch is a notification subscription, not a turn-end signal; 8 unnecessary stops in a single 2026-05-24 session followed this exact anti-pattern. See operator-local memory `feedback-bash-sleep-block-recovery` Pattern B (#2116).

Ready-stall blocker note required fields: `BLOCKER_NOTE`, `owner`, `unblock_condition`, `eta_or_review_time`.

## Self-annealing constraints

- Maximum one anneal pass per invocation.
- Maximum three proposed documentation changes per invocation.
- Never auto-modify security or permission policy — propose changes only.
- If evidence is insufficient, return `NO_CHANGE` with missing-evidence requirements.
- No unbounded loops, recursive retries, or autonomous "improve forever" behavior.

## Self-annealing protocol

1. Detect mismatch between expected and observed behavior.
2. Classify root cause: `ambiguity`, `missing guardrail`, `stale instruction`, `tool fragility`, or `human override`.
3. Assess recurrence risk: `low`, `medium`, or `high`.
4. Propose minimal docs/workflow delta that prevents recurrence.
5. Define objective verification gate confirming the fix works.

## Three-tier escalation model

Anneal triggers route through one of three tiers per Epic #1308. See `[[distributed-self-anneal]]` for full design and `[[andon-pull-protocol]]` for any-role pull mechanics. The base protocol above is the Tier-2 mid-flight pivot phase.

### Tier 1 — Observation (any role)

Append a drift event to `~/.megingjord/incidents.jsonl` (schema v2). No threshold, no ticket. Pure trend capture for the recurrence detector.

### Tier 2 — Mid-flight pivot (auto-ticket)

Triggers when `severity ≥ medium` AND (recurrence ≥ 2 in 7d OR `trigger_type == manual-pull`) AND no active session-pivot AND no matching suppression entry. Effect: orchestrator pauses current baton step, snapshots state, runs the protocol above, files Manager ticket(s) to backlog, restores baton.

#### Guardrail-first disposition (Epic #3380)

A Tier-2 friction is, by default, an opportunity to build a **guardrail that prevents that friction for
every team** — not a workaround note that enlarges always-resident memory and re-bills its token cost
every session. Before a friction is recorded as a memory note, route it through the deterministic
classifier `scripts/global/friction-classifier.js` (`classifyFriction(record)`), which maps it to one of
four destinations:

| Destination | When | Action |
|---|---|---|
| `guardrail-candidate` | mechanical surface named (gate / hook / validator / regex / state-file / parser / enforcer) AND recurrence ≥ 2 AND severity ≥ medium AND reproducible | file a guardrail ticket; build a **hook → validator → test → CI backstop** (prevention-first ladder) |
| `skill` | a correct, reusable multi-step procedure (≥ 3 ordered steps), not a defect | promote to a skill / runbook |
| `semantic-memory` | judgment / preference / client directive / external fact | keep a memory note — this is memory's *correct* use |
| `forget` | one-off below the recurrence floor | let it decay in `incidents.jsonl`; do not promote to memory |

**Anti-over-route (binding):** judgment/preference **wins on collision** — a record that names a mechanical
surface *and* hits the judgment lexicon (or `trigger_role: client`) routes to `semantic-memory`, never to a
guardrail. Unknown/low-confidence inputs **fail open** to `semantic-memory`. A preference is never
auto-converted into a blocking guardrail.

**Consolidation / forgetting policy:** on the 2nd in-window recurrence of a `guardrail-candidate` pattern,
file (or de-dupe onto) a guardrail ticket and link the note to it. When that guardrail ships
(`resolution:released`), **delete the originating note(s) and its MEMORY.md index line** — the guardrail now
prevents the recurrence, so the note's job is done. `forget`-class records decay under `log-rotation.js`;
they are never promoted to MEMORY.md.

**Cross-team & promotion:** the classifier + lexicon live in `scripts/global/` and `config/` (the shared,
runtime-agnostic surface mirrored to claude-code / copilot / codex / antigravity) — one guardrail protects
all four teams. Promotion of the memory-write guard from advisory to blocking is gated on replay-eval
precision ≥ 0.85 against `tests/fixtures/friction-corpus.json` (`friction-classifier-replay-eval.js`),
**never a calendar threshold**. Operator guide: `docs/howto/guardrail-first-anneal.md`.

### Tier 3 — Consultant goal-failure escalation

Authority: Consultant only. Triggered when consultant rubric finds G1–G9 goal violation post-implementation. Effect: invoke Manager to (a) reopen failed AC/ticket via baton, (b) file new self-anneal Epic for systemic patterns.

### Authority matrix

| Action | Authority |
|---|---|
| Append Tier-1 event | Any role |
| Request Tier-2 pivot | Any role (router classifies) |
| Invoke Tier-3 escalation | Consultant only |
| File Manager ticket from anneal | Manager (auto-routed via Tier-2 workflow) |

### Bounded-loop guards (kill switches)

- Max 1 active pivot per session (single-flight)
- Max 3 pivots per 24h per session (rate-limit)
- Max 5 anneal tickets per 7-day window per `pattern_id` (suppression cooperation with #1220)
- Anneal step counter aborts with `decision: defer` if >50 tool calls
- All trips emit `event:kill-switch-trip` for dashboard observability

## Breaking-Change Recovery Handoff

When Tier-3 Consultant escalation identifies a G1–G9 goal violation caused by a
merged breaking change, invoke the **Breaking-Change Recovery Protocol** from
`instructions/breaking-change-recovery.instructions.md`. The protocol covers
six phases: Detect → Revert → Triage → Fix → Re-merge with smoke evidence →
Casualty re-author. Tier-3 authority (Consultant) initiates; Manager and Admin
execute the revert and fix phases.

## Documentation drift detection

Run `docs-drift-maintenance` skill after any change to:
- Commands, CLI flags, or API behavior.
- Configuration files, defaults, or environment variables.
- Workflows, CI/CD pipelines, or automation scripts.
- UX-visible behavior, user-facing features, or settings.

## catch-empty suppression contract

- `scripts/global/catch-empty-lint.sh` intentionally scans `.github/workflows/` only.
- `scripts/global/` and `hooks/scripts/` may contain intentional non-empty catch handlers and are governed by code review plus unit tests instead of the workflow YAML lint.
- Use `// catch-empty: <reason>` only for best-effort label/comment cleanup or equivalent known-safe GitHub API misses; if the handler can distinguish expected failures, prefer filtering the expected status code and rethrowing everything else.
