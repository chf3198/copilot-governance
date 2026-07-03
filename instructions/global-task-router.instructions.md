---
name: Global Task Router
description: Route work through local-first cascade lanes with capability matrix. Fleet is the highest zero-cost execution lane after Free/Auto, subject to Governance (G1) and Quality (G2).
applyTo: "**"
---

# Global Task Router

Policy source: `scripts/global/model-routing-policy.json` (capability_matrix field).

## Lane order (cost-ascending mandate)

1. **Free** — Auto tier. Lookup, analysis, docs, Q&A, boilerplate. Zero tokens.
2. **Fleet** — `fleet-coding-local`. Medium implementation, known-pattern
   coding, config gen, log analysis. Zero tokens. **Execute via cascade-dispatch.**
3. **Haiku** — `balanced-cloud`. Single-file refactors, test gen, code review.
4. **Premium** — `frontier-reasoning`. Multi-file architecture, security,
   ambiguous debugging.

**Fleet-unavailable failover (#2619)**: when Fleet is **unreachable** (an
*availability* failure — no answer produced), `cascade-dispatch` fails over to
the `free-cloud` tier (`$0` ordered providers: openrouter-free, gemini, groq,
cerebras) **before** any paid tier. Only a *capability* failure (Fleet answered
but quality/judge inadequate) steps up to paid Haiku. This preserves the
cost-ascending mandate when the local fleet host is down — do not escalate
straight to Haiku on a fleet outage. As of #2621 this failover is **executed**,
not merely signalled: `cascade-dispatch` calls `free-cloud-dispatch.js`, which
tries the policy `free-cloud` providers in order (via `wrapProviderCall`) and
returns the answer directly (`tier: free-cloud`). If no free-cloud key is
configured or all providers fail, it degrades gracefully to the advisory
`suggested_tier: free-cloud` signal. Free-cloud chain detail:
`skills/openrouter-free-failover`.

Codex, Copilot, and Claude Code sessions all use the same lane policy. A lane
selects required capability and cost tier. Runtime, provider, model family, and
lane are separate concepts:

- **Runtime**: Codex, Copilot, Claude Code, or another agent surface.
- **Provider**: Anthropic, OpenAI-compatible, Ollama, OpenRouter, LiteLLM, or fleet.
- **Model family**: vendor/model lineage selected by an adapter.
- **Lane**: free, fleet, haiku, or premium capability/cost tier.

Provider IDs and telemetry adapters are implementation details owned by HAMR,
`model-routing-policy.json`, and `routing-provider-adapters.json`.

## Capability matrix (use for ticket assignment and lane selection)

| Dimension | Fleet (local) | Haiku | Premium |
|---|---|---|---|
| Reasoning depth | Lookup / extraction / slot-fill | 2–3 step reasoning | Multi-hop / planning / proof |
| Code complexity | Autocomplete, boilerplate, single fn | Single-file refactor, test gen | Multi-file, cross-module arch |
| Context length | <8K tokens | 8K–32K | >32K / large-context coherence |
| Tool-call chain | 1–2 calls, well-specified | 3–4 calls with retry | 5+ calls, long-horizon agent |
| Ambiguity level | Well-specified + clear schema | Multi-constraint + some ambiguity | Underspecified / OOD |

**Direct-to-Premium** (skip cascade): security review, vulnerability audit, architecture design,
incident response, cross-system trade-off, concurrency analysis.

## Fleet execution mandate

For fleet-lane tasks ≥6 words, the hook runs `cascade-dispatch.js --execute` against Ollama.
If fleet response is high-confidence: incorporate the returned content, do NOT regenerate.
If fleet signals `escalation_needed=true`: use the `suggested_tier` (haiku first, not premium).

## Escalation rules

- Start in lowest adequate lane; never skip haiku to reach premium.
- Premium escalation requires a short rationale. Record: lane, model, rationale, trigger.
- If premium share exceeds 20% over 7 days, routing engine forces fleet lane (`npm run routing:report`).

## Cost/observability mechanics within each lane

This file selects the **lane**. Cost levers (caching, spillover, sticky-route,
batching) and observability (cache-hit gate, /quota, /mcp doctor:probe) live in
HAMR, not here. See `instructions/hamr-routing.instructions.md`. Do not
duplicate HAMR mechanics in this file or make lane policy runtime-specific.
