---
wiki_type: wisdom
scope: project
source_path: wiki/wisdom/project/research/role-fleet-executability-2026-05-28.md
last_updated: 2026-05-28
freshness_window: none
phase_1_ticket: 2319
parent_epic: 2299
phase_0_sources: ["#2299"]
---

# Per-Role Fleet-Executability Assessment + A1 Matrix Design

Phase-1 child: #2319 (of Epic #2299).
Date: 2026-05-28.
Status: v1 initial synthesis.

## Executive summary

The Megingjord harness today relies on a single AI agent (Claude Code, claude-sonnet-4-6)
as the singular executor of all four baton roles plus Red-Team plus IT. This synthesis
assesses the feasibility and priority of migrating each role's work to fleet resources
(local Ollama, fleet-host GPU, OpenRouter free tier, HAMR routing). It generalizes the
A1 model-selection matrix -- previously designed only for Red-Team -- to apply to any role.
Migration priority by impact x feasibility is computed to guide D3 implementation ordering.

Key findings:

- Admin and Red-Team are fleet-executable today with high confidence.
- Collaborator is fleet-executable for a large fraction of tasks today.
- Consultant is fleet-executable for rubric-scoring sub-tasks today (Red-Team pattern).
- Manager has a significant fraction deferrable to fleet once ACs are templatable.
- IT is already non-AI; fleet applies only for model-management scripting.

## Per-role fleet-executability assessment table

| Role | Fleet rating | Fleet fraction today | Rationale |
|---|---|---|---|
| Manager | partial | ~30% | Scope-templating, label-selection, and AC-drafting for well-defined task types are fleet-executable. Multi-hop planning, ambiguous backlog grooming, and cross-system trade-off analysis require frontier reasoning. Migration candidate: templatable sub-tasks (standard ticket types, label ops, progress comments). |
| Collaborator | today | ~70% | Standard boilerplate, single-file refactors, codegen from specs, test generation, and config-gen are fleet-executable via fleet-coding-local lane. Multi-file architecture, cross-module design, security-sensitive implementation, and ambiguous debugging require premium tier. The global-task-router already routes fleet-lane tasks. |
| Admin | today | ~90% | Git ops (commit, push, merge, tag), CI verification, npm run sync:*, release evidence collection, and HAMR sync are fully scriptable. Fleet inference for prose generation in the admin-handoff artifact is feasible. The fraction not fleet-executable: subjective merge-decision when CI edge cases are ambiguous. |
| Consultant | today | ~65% | Rubric scoring against a defined rubric, per-AC verification pass/fail checks, and closeout-schema validation are fleet-executable (Red-Team pattern proves this). Deep multi-hop cross-system critique, G1-G9 goal-failure Tier-3 escalation decisions, and non-trivial flaw classification require frontier reasoning. |
| IT | N/A | ~0% (AI) | IT work is setup + config of fleet hardware/services per D2. It is non-GitHub, non-AI work by contract. Fleet does NOT mean AI inference for IT -- it means scripted automation (Ansible, shell, devbox). Fleet model involvement is only for edge cases like Ollama model-management CLI generation. |
| Red-Team | today | ~100% | Already fleet-executed by contract. Cross-family adversarial review dispatched to qwen2.5-coder or qwen3 on 36gbwinresource via fleet-red-team-dispatch.js. The A1 matrix (config/red-team-model-matrix.yml) governs model selection at dispatch time. |

### Rating legend

| Rating | Definition |
|---|---|
| today | Fleet-executable now with current tooling; HAMR routing + fleet-coding-local lane can handle |
| partial | Subset of role tasks fleet-executable today; remainder requires premium tier or is not yet supported |
| future | Fleet-execution feasible after tooling investment; blocked by harness gaps |
| N/A | Role is non-AI by contract; fleet inference does not apply |

## A1 matrix design -- generalized to per-role

The A1 selection function was designed in #2299 for Red-Team model selection.
This section generalizes it to a per-role dispatch decision applicable to any role.

### Five factors (per Client decision A1)

| Factor | Definition | Applies to |
|---|---|---|
| Availability | Is the required model loaded and responsive? Does the fleet host have sufficient VRAM for the prompt size? Has the model been seen working at this prompt size in this session? | All roles using fleet inference |
| Capability vs task | Does the model family capability profile match the task reasoning depth, code complexity, context length, tool-call chain, and ambiguity level per the global-task-router matrix? | All roles |
| Cost | Fleet inference is zero-marginal; cloud paid inference has per-token cost. Prefer fleet then free cloud then paid cloud per G3 goal-lens. | All roles |
| Throughput | Latency budget for the calling context. If the calling baton role needs sub-30s response, smaller models win over larger models. | All roles -- especially Collaborator (blocking CI) and Admin (release gating) |
| Cross-family | For adversarial/critique roles (Red-Team, Consultant rubric-scoring), the model family MUST differ from the submitting AI agent's family to satisfy independence invariant. | Red-Team (required); Consultant (required for signer-independence gate); Collaborator (optional but preferred) |

### Per-role A1 matrix application

| Role | Availability check | Capability filter | Cost preference | Throughput budget | Cross-family required? |
|---|---|---|---|---|---|
| Manager | fleet-host ping + model list | >=7b reasoning-tuned for scoping; >=32b for multi-hop planning | fleet > free cloud > paid | relaxed (planning is async) | No |
| Collaborator | fleet-host ping + VRAM check for code tasks | coder-family preferred (qwen2.5-coder:7b/32b); >=7b for single-file; >=32b for multi-file | fleet > free cloud > paid | medium (blocking CI on code-change lane) | No (preferred for quality) |
| Admin | N/A for scripted ops; fleet for prose generation | small model sufficient for admin-handoff prose (<7b) | fleet only | tight (<10s for git ops) | No |
| Consultant | fleet-host ping + model list | reasoning-tuned >=32b for deep critique; coder-family for code rubric | fleet > free cloud > paid | relaxed (critique is async) | YES -- signer-independence gate |
| IT | N/A | N/A | N/A | N/A | N/A |
| Red-Team | fleet-host ping + VRAM check + qwen stall-detection | coder-family for code critique; general-reasoning for protocol/ADR review | fleet only (zero-marginal mandate) | relaxed (async dispatch) | YES -- cross-family invariant |

### A1 selection algorithm (pseudocode)

```text
function selectModel(role, task, context):
  candidates = allModels()

  // Factor 1: availability
  candidates = candidates.filter(m => m.isLoaded() && m.hasVRAM(task.promptSize))

  // Factor 2: capability vs task
  tier = globalTaskRouter.lane(task)  // free | fleet | haiku | premium
  candidates = candidates.filter(m => m.capability >= tier.minCapability)

  // Factor 3: cost -- fleet < free-cloud < paid
  candidates = candidates.sortBy(m => m.costTier)

  // Factor 4: throughput
  if context.latencyBudget < 30s:
    candidates = candidates.filter(m => m.p99Latency < context.latencyBudget)

  // Factor 5: cross-family
  if role.requiresCrossFamily:
    submitterFamily = context.submittingAgent.modelFamily
    candidates = candidates.filter(m => m.family != submitterFamily)

  return candidates[0] ?? escalate(tier.next)
```

The algorithm mirrors the HAMR routing logic but adds the cross-family constraint for
critique roles. It is the generalization of the Red-Team dispatch function in
`scripts/global/fleet-red-team-dispatch.js`.

### Runtime applicability of the A1 matrix

| Runtime | A1 applicable? | Notes |
|---|---|---|
| Claude Code | Yes | Primary runtime today. Dispatches fleet via cascade-dispatch.js. A1 selection function consumed by fleet-red-team-dispatch.js for Red-Team; applicable to all role dispatch. |
| Codex | Yes | Codex Team mirrors fleet dispatch scripts at ~/.codex/devenv-ops/scripts/. A1 matrix in config/red-team-model-matrix.yml is loadable by Codex fleet dispatch path. Cross-family constraint applies (Anthropic != OpenAI). |
| Copilot | Yes | Copilot Agent HQ uses the same skill loading mechanism. A1 matrix applies to Copilot-dispatched fleet critiques. Cross-family constraint applies (GitHub Copilot model != Anthropic). |
| Antigravity | Yes (future) | Antigravity SDK is cross-runtime by design. A1 matrix as a YAML config is format-agnostic and consumable by any SDK that can load YAML and call an Ollama endpoint. |

## Migration prioritization by impact x feasibility

### Scoring rubric

Impact: reduction in frontier-token cost (G3) + improvement in throughput (G7) + governance
quality improvement (G1) when fleet-sourced critique adds independence evidence.

Feasibility: how much harness gap exists today; inversely proportional to migration effort.

| Role | Impact (1-10) | Feasibility (1-10) | Priority (I x F) | Migration order | Blocker |
|---|---|---|---|---|---|
| Red-Team | 9 | 9 | 81 | 0th (done) | Already fleet-executed; #2317 formalizes the skill |
| Admin | 7 | 9 | 63 | 1st | None -- git ops already scriptable; fleet inference for prose is additive |
| Collaborator | 8 | 7 | 56 | 2nd | Fleet-coding-local lane exists; needs prompt-templates per #2181 for baton-aware task dispatch |
| Consultant | 7 | 6 | 42 | 3rd | Red-Team pattern applicable; needs rubric-as-YAML config; signer-independence constraint is well-defined |
| Manager | 5 | 4 | 20 | 4th | Templatable scoping requires AC-template library; high-reasoning tasks not fleet-executable without further capability uplift |
| IT | 0 | N/A | N/A | N/A | Non-AI by contract |

### Migration sequencing rationale

**0th: Red-Team (already done)**
Red-Team was the proof-of-concept for fleet execution in the harness. The A1 matrix, fleet
dispatch script, and cross-family invariant are all established. #2317 formalizes the skill.

**1st: Admin**
Admin is highest-feasibility because it is nearly 100% scriptable with no reasoning gap.
The main migration artifact is ensuring the admin-handoff prose generation (currently Claude Code)
can be delegated to a small fleet model or templated. Git ops do not require inference at all.
No new HAMR routing changes needed -- this is a configuration change.

**2nd: Collaborator**
The global-task-router already routes fleet-lane Collaborator tasks to fleet-coding-local.
The gap is baton-aware task dispatch: fleet models need to know which AC they are implementing,
what test strategy to use, and how to emit a valid collaborator-handoff. Prompt templates
(#2181) close this gap. Once templates exist, fleet dispatch can execute standard Collaborator
tasks with the same output format validators already check.

**3rd: Consultant**
The Red-Team critique pattern (adversarial rubric scoring) is directly applicable to Consultant
rubric execution. The gap is a rubric-as-YAML config that fleet models can consume, similar to
the Red-Team model matrix. Signer-independence constraint is the key governance invariant to
preserve: fleet Consultant model family must differ from fleet Collaborator model family.

**4th: Manager**
Manager migration is the hardest because scope-setting and AC-authoring require multi-hop
reasoning for non-standard ticket types. The tractable migration path:

- Standard ticket types (research child, code-change child, config-only) have templatable
  ACs and gates -- fleet-executable once a template library exists.
- Backlog grooming, cross-system dependency analysis, and escalation decisions remain
  frontier-only.

## Per-runtime applicability summary (AC5)

| Aspect | Claude Code | Codex | Copilot | Antigravity |
|---|---|---|---|---|
| Fleet dispatch mechanism | cascade-dispatch.js + direct Ollama curl | Mirror of cascade-dispatch.js in ~/.codex/ | Copilot Agent HQ + fleet skill loading | SDK-native; same Ollama endpoint contract |
| A1 matrix consumption | config/red-team-model-matrix.yml (today); generalized per-role YAML (D3 follow-on) | Same YAML; Codex loads via skill path | Same YAML; Copilot loads via skill path | Same YAML; format-agnostic |
| Cross-family invariant | Anthropic (claude-sonnet) != Alibaba (qwen2.5-coder) | OpenAI != Alibaba | GitHub Copilot model != Alibaba | Substrate-defined; same invariant |
| HAMR routing integration | Full (HAMR_TEAM=claude-code) | Full (HAMR_TEAM=codex) | Full (HAMR_TEAM=copilot) | Planned (D3 follow-on) |
| Signer-independence gate | Admin alias != Collaborator alias across fleet dispatch | Same signer-alias-fidelity rules | Same | Same |

The A1 matrix YAML format is runtime-agnostic by design. Each runtime loads the same config
file and runs the same selection algorithm; only the cross-family constraint input (the
submitting agent model family) varies per runtime.

## Harness gaps to close for full D3 delivery

| Gap | Blocks | Follow-on ticket |
|---|---|---|
| Per-role prompt templates (collaborator-handoff format, AC checklist fill) | Collaborator fleet migration | #2181 (in progress) |
| Rubric-as-YAML config for fleet Consultant scoring | Consultant fleet migration | D3 follow-on (to be filed) |
| HAMR per-role routing enforcement (lane policy forces fleet for fleet-capable tasks) | All roles | #2320 (in progress) |
| AC-template library for standard ticket types (Manager fleet migration) | Manager fleet migration | D3 follow-on (to be filed) |
| Admin handoff prose template (small-model generation) | Admin fleet migration | D3 follow-on (to be filed) |

## Goal-lens assessment

| Goal | Score | Rationale |
|---|---|---|
| G1 Governance | 9 | Fleet execution preserves signer-independence invariant when cross-family constraint is enforced. Baton artifact format validators are unchanged. |
| G2 Quality | 8 | Fleet models produce lower-quality output for ambiguous tasks; mitigated by routing only well-defined tasks to fleet. Escalation path preserved. |
| G3 Zero Cost | 10 | Fleet execution eliminates frontier-token cost for ~90% of Admin tasks and ~70% of Collaborator tasks today. Priority ordering by IxF maximizes cost savings per unit of migration effort. |
| G4 Privacy | 9 | Fleet inference on local Ollama keeps code/content on-prem. Cloud provider exposure reduced for standard tasks. |
| G5 Portability | 9 | A1 matrix YAML is format-agnostic and runtime-portable across all four runtimes. No runtime-specific hard-coding in the selection algorithm. |
| G6 Resilience | 8 | Fleet host unavailability falls back to HAMR spillover (haiku then premium). Escalation path defined per A1 algorithm. |
| G7 Throughput | 9 | Fleet models have lower latency for well-specified tasks. Admin git ops need no inference at all; throughput improvement is near-instant for that fraction. |
| G8 Observability | 8 | HAMR wraps fleet dispatch calls; tier=fleet is tagged in cache-stats.jsonl. Per-role attribution preserved via signer alias. |
| G9 Interoperability | 9 | A1 matrix as YAML + same Ollama endpoint across runtimes satisfies G9. No per-runtime adapter needed. |
| G10 Maintainability | 8 | Per-role matrix is a single YAML config. Adding a new role requires one new row. Fleet dispatch code shared via cascade-dispatch.js generalization. |

Mean: 8.7 / 10.

## References

- Parent Epic: #2299 (role taxonomy refactor + fleet preference mandate)
- Phase-0 source: #2299 body (ratified decisions D1/D2/D3 + A1/A2/A3/A4)
- Sibling tickets: #2317 (Red-Team skill), #2318 (IT role skill), #2320 (HAMR per-role routing),
  #2321 (7-role taxonomy formalize), #2322 (memory anchor cleanup)
- Fleet dispatch: scripts/global/fleet-red-team-dispatch.js (existing)
- A1 matrix config: config/red-team-model-matrix.yml (being created in #2317)
- HAMR routing: instructions/hamr-routing.instructions.md
- Global task router: instructions/global-task-router.instructions.md
- Test methodology: instructions/test-methodology-matrix.instructions.md
- Operator identity: instructions/operator-identity-context.instructions.md
