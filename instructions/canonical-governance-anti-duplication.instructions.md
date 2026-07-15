---
name: Canonical Governance Anti-Duplication
description: Establish single source of truth for governance contracts and adapter pattern for runtime-specific behavior. Prevent redundancy across multi-orchestrator deployments.
applyTo: "instructions/**,scripts/global/**,.codex/**,.github/**"
---

# Canonical Governance Anti-Duplication

## Problem

The harness supports multiple orchestrators (Copilot, Codex, Claude Code agents). Without canonical authoring rules, governance contracts risk duplication:
- Same schema implemented separately per runtime → divergence → bugs
- Same validator logic copied → maintenance burden
- Scattered responsibility → unclear ownership → conflicts

## Solution: Single Source + Adapter Pattern

### Core Rule: Single Source of Truth (SSoT) in Main Repo

**All governance originates here** (`/home/curtisfranks/devenv-ops`), never directly in deployed runtimes.

**Canonical locations:**
```
config/                      ← schemas, profiles, matrices (runtime-agnostic)
scripts/global/              ← shared validators, parsers, logic
instructions/                ← contracts, rules (runtime-agnostic)
.github/copilot-instructions.md    ← Copilot-specific guidance
.codex/AGENTS.md             ← Codex-specific guidance
```

**Deploy unidirectional**: Repo → `npm run deploy:both:apply` → runtimes

### Adapter Pattern for Runtime-Specific Behavior

When runtime A needs different implementation than B:

1. **Shared contract lives in repo** (e.g., `config/authorization-profiles.json`)
2. **Runtime-specific adapter wraps it** (e.g., `.codex/adapters/authorization-profile.js`)
3. **Adapter respects shared schema** — adds runtime-specific interpretation layer
4. **Tests cover both shared + adapted behavior**

**Example**:
- Shared: `config/authorization-profiles.json` (capabilities matrix)
- Copilot adapter: maps capabilities to Copilot's API permission model
- Codex adapter: maps capabilities to Codex's role/permission model

### Naming Convention for Governance Tickets

Prevent duplicate ticket titles:

```
❌ BAD (causes confusion):
#1700 epic(governance): canonical cross-orchestrator governance
#1701 epic(governance): canonical cross-orchestrator governance

✅ GOOD (clear responsibility):
#1700 epic(governance): federated policy distribution
#1701 epic(governance): adapter framework and onboarding
```

Format: `<type>(<area>): <specific responsibility>`
- `type`: feat, fix, research, docs, test, epic, task
- `area`: governance, self-anneal, auth, routing, review
- `specific responsibility`: what this ticket owns (not "canonical X")

### Namespace Isolation for Multi-Team Work

Coordinate across teams:

1. Designate one team as **policy author** (writes contracts)
2. Other teams are **consumers** (implement adapters)
3. Use issue assignment to clarify boundary
4. Cross-team PRs reference the policy-owner ticket

**Example**: Claude Team writes authorization profile schema (#1758), Copilot Team adapts it via their own branch when needed.

## Anti-Duplication Checklist

Before implementing governance feature X, verify:

- [ ] Is X runtime-agnostic or runtime-specific?
- [ ] Does X conflict with existing rules/schemas?
- [ ] Is X scoped to a single ticket?
- [ ] Does X have unit tests?
- [ ] Is X documented in `instructions/` or `.github/`?
- [ ] Governance drift tests pass (`npm run governance:verify`)?

## Conflict Resolution

**Two tickets cover same surface?**  
→ Lower issue number is canonical; higher is reference/duplicate

**Two branches implement same contract differently?**  
→ First merge is canonical; second adapts via adapter pattern

**Runtime-specific feature needed everywhere?**  
→ Upstream to shared contract; deprecate runtime-specific with migration guide

## Adapter parity (#1798 F5 decision)

The Python governance hooks under `hooks/scripts/*.py` are wired into Copilot (`~/.copilot/hooks/global-standards.json`) and Codex (`~/.codex/hooks.json`) runtime adapters. **Claude Code is intentionally exempt** — `~/.claude/settings.json` carries no `"hooks"` block.

Rationale: Claude Code session lifecycle, memory model, and tool API are owned by Anthropic's runtime. Wiring shared Python hooks into Claude would duplicate logic already present in Claude Code's native gates (e.g., `manager-ticket-lifecycle` skill, baton-orchestrator skill). Adding Python-hook parity would create a second enforcement surface that drifts from Claude Code's primary baton enforcement path.

The trade-off favored: **G5 (portability) + G9 (interoperability)** over **G7 (throughput consistency)**. Operators on Copilot or Codex see hook-driven warnings; operators on Claude Code see skill-driven warnings; the substantive governance contract (Team&Model signing, baton order, ticket-first, dedicated worktree) is enforced on all three via different mechanisms.

Cross-team contract entry point: `governance/README.md`. Operators should consult that file as the canonical reference rather than relying on hook-driven warnings as a checklist.

## Per-runtime hook event registration matrix (#1804 decision)

Each adapter wires only the lifecycle events its native runtime emits. Wiring an event the runtime never fires would be dead code; omitting one it does fire would lose enforcement coverage. The matrix below documents the intentional asymmetry surfaced by the Epic #1798 stress test (Codex Step 8).

| Event | Codex CLI | Copilot (Auto: Claude family) | Claude Code | Notes |
|---|:---:|:---:|:---:|---|
| `SessionStart` | ✓ | ✓ | n/a (skill) | All three fire; Claude Code handles via skill |
| `UserPromptSubmit` | ✓ | ✓ | n/a (skill) | |
| `PreToolUse` | ✓ | ✓ | n/a (skill) | |
| `PostToolUse` | ✓ | ✓ | n/a (skill) | |
| `Stop` | ✓ | ✓ | n/a (skill) | |
| `PermissionRequest` | ✓ (Codex-only) | — | — | Codex-specific permission-mode event |
| `PreCompact` | ✗ not emitted | ✓ | ✓ | Codex feature request `openai/codex#12208` closed as duplicate of `#2109` (still pending) |
| `SubagentStart` | ✗ not emitted | ✓ | ✓ | Anthropic-runtime-native (Claude Code's `Agent` tool spawn); Copilot Auto-routing on Claude family inherits |

Source: `https://developers.openai.com/codex/hooks` (Codex native event list = SessionStart + PreToolUse + PermissionRequest + PostToolUse + UserPromptSubmit + Stop, 2026).

Operators should NOT attempt to add `PreCompact` or `SubagentStart` registration to `~/.codex/hooks.json` — Codex CLI will never fire them and the entries are inert. When Codex CLI gains these events (track `openai/codex#2109`), revisit this matrix.

## Enforcement

Mandatory checks for governance changes:

```bash
npm run lint:md                  # Format
npm run governance:verify        # Artifact consistency
npm run docs:drift               # Implementation vs. docs
```

Add to CI as governance-area gate.

## See Also

- Playbook: `research/canonical-governance-anti-duplication-2026-05-16.md`
- Related: #1728 (signer integrity), #1758 (authorization profiles)
- Adapter onboarding: `docs/howto/governance-adapter-onboarding.md`
