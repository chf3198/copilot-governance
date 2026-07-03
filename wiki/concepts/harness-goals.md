---
title: "Harness Goal Constitution"
type: concept
created: 2026-05-06
status: active
---
# Harness Goal Constitution

## Summary

The harness goal constitution is the priority-ordered decision lens for governed
work across Claude Code, Copilot, and Codex sessions. It keeps role workflow,
cost routing, privacy, runtime behavior, and cross-team compatibility aligned.

## Canonical Order

1. Governance
2. Quality
3. Zero Cost
4. Privacy
5. Portability
6. Resilience
7. Throughput
8. Observability
9. Interoperability
10. Maintainability

## Decision Rule

Evaluate governed decisions in order. If a lower-priority goal wins over a
higher-priority goal, record the rationale in the ticket, PR, or closeout
evidence.

## Always-Loaded Surfaces

These surfaces inject the priority sentence into every governed session at startup or via the goal-keyword hook:

- `.github/copilot-instructions.md` (Copilot runtime)
- `.codex/AGENTS.md` (Codex runtime)
- `instructions/global-standards.instructions.md` (Claude Code via `CLAUDE.md` @-include)
- `hooks/scripts/goal_lens.py` (UserPromptSubmit hook on goal-decision keywords; all runtimes)

## Reachable on Demand (NOT auto-included)

- `instructions/harness-goals.instructions.md` — canonical goal constitution with expanded G1..G10 definitions. Contains the full priority sentence + per-goal definitions, but is NOT @-included by any runtime entry point. Read on demand or via `goal_lens.py` keyword trigger. (Per #1105 D-001 cross-team verification: CC + CX both confirmed.)

## Loading Paths (per runtime)

How the priority sentence reaches each runtime session at startup:

| Runtime | Primary load path | Mechanism |
| --- | --- | --- |
| Claude Code | `CLAUDE.md` @-includes `instructions/global-standards.instructions.md` (line 34 carries the priority sentence) | `@`-include resolved at session boot |
| Copilot Chat | `.github/copilot-instructions.md` lines 80-81 carry the priority sentence inline | Repo-rooted Copilot Instructions auto-loaded |
| Codex CLI | `.codex/AGENTS.md` line 8 carries the priority sentence inline | Codex baseline AGENTS.md auto-loaded |
| All runtimes (on-demand) | `hooks/scripts/goal_lens.py` injects priority sentence + decision-check note | UserPromptSubmit hook on goal-decision keywords (see below) |

### `goal_lens.py` trigger keywords

The hook activates when the user prompt matches the regex (case-insensitive):

```text
\b(decide|decision|choose|tradeoff|priority|prioritize|rank|route|
   policy|architecture|design|should we|which option|compare)\b
```

(Source: `hooks/scripts/goal_lens.py#L14-L16`)

When a match is found, the hook injects a compact context block containing the priority sentence + a "decision check: justify any lower-priority override with explicit evidence" reminder.

### Verification source

This section reflects empirical verification by Claude Code Team and Codex Team during the #1105 cross-team R&D synthesis (2026-05-07). Prior documentation incorrectly claimed `instructions/harness-goals.instructions.md` was always-loaded; cross-team grep against `CLAUDE.md`, `AGENTS.md`, `.codex/AGENTS.md`, and `.github/copilot-instructions.md` confirmed it is NOT @-included by any runtime entry point. Only the priority sentence reaches sessions — via the inline references above. The expanded G1..G10 definitions are reachable on demand only.

## Goal Definitions

- Governance: policy, role, provenance, and ticket controls are non-negotiable.
- Quality: maximize correctness and engineering value of outcomes.
- Zero Cost: prefer local, fleet, and free lanes before paid providers.
- Privacy: keep sensitive context local unless explicit override exists.
- Portability: avoid user-specific coupling; settings-driven behavior preferred.
- Resilience: degrade gracefully and keep fallback paths for partial outages.
- Throughput: preserve acceptable speed after higher-priority goals are met.
- Observability: make decisions and outcomes visible, auditable, attributable.
- Interoperability: preserve compatibility across agent surfaces and runtimes.
- Maintainability: files ≤100 lines; cyclomatic complexity ≤10 per function; no dead code at merge; changes documented via GOV-009 EDD before implementation (#1530).

## Sources

- Epic #1024: harden harness OKR goals as always-available session context.
- Research #1025: reconciles provisional O1-ON lists to the 9-goal order.
- Task #1030: installs the always-loaded instruction and hook context surfaces.
