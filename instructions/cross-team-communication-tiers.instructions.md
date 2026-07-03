# Cross-Team Communication Tiers (Epic #2488 Phase-0 AC-R5)

The harness coordinates multiple AI agents (Claude Code, Copilot, Codex, Antigravity) over a
**mailbox / claim / artifact** substrate. Which substrate is the default depends on the
**communication tier**. This contract codifies that selection; the per-route GitHub-native
mappings live in the Phase-0 synthesis `research/github-cross-team-communication-2026-05-31.md`
(#2489) — this file does **not** duplicate the route table.

## The three tiers

| Tier | Topology | Default substrate | Rationale |
|---|---|---|---|
| **Tier-1 — workspace** | One repo/workspace; multiple AI agents coordinate on its tickets | **GitHub-native** (Issues/labels/refs/Releases/Actions) | G5/G3: zero Cloudflare dependency; GitHub is already the source of truth (#2489) |
| **Tier-2 — cross-workspace** | One user, 2+ workspaces; agents in workspace A ↔ workspace B | **HAMR** (Cloudflare Worker + KV/R2) | No single shared repo; HAMR is the neutral relay. Design deferred (Epic #2488 out-of-scope) |
| **Tier-3 — cross-user / org** | Distinct users/orgs; no shared write access | **HAMR / neutral substrate** | Requires a genuinely neutral, auth-brokered relay; GitHub repo perms are insufficient |

**Tier-1 is the harness's primary use case today.** Tiers 2/3 are tracked as future exploration
(see Epic #2488 "Out of scope" + follow-on tickets); this contract names their default so a route
author knows which substrate to target.

## Substrate selector (dual-mode contract)

A thin client wrapper selects the substrate by env, **GitHub-native default for Tier-1**:

```
MEGINGJORD_HAMR_ENABLED unset|0  ->  GitHub-native primitive (Tier-1; no Cloudflare account needed)
MEGINGJORD_HAMR_ENABLED=1        ->  HAMR Worker route (accelerator; required substrate for Tier-2/3)
```

Both modes satisfy the **same logical contract** per route (`acquire/release/status`, `read/write`,
`fetch`, `emit`), so either produces the governance evidence a route is required to emit. HAMR is an
opt-in **accelerator** at Tier-1, the **primary relay** at Tier-2/3, and the **failover** at Tier-1
when GitHub is unreachable.

## Fallback ordering (Tier-1)

GitHub is Tier-1's substrate, so degrade gracefully — never hard-fail:

1. **HAMR-as-failover** (`MEGINGJORD_HAMR_ENABLED=1`): accelerator becomes the backup relay.
2. **Local-state**: append-only mailbox (comments replay on return; no conflict) and
   single-source-of-truth claims (the ref/issue is canonical; local re-reads, never merges).
   Coordination *pauses*, it cannot corrupt or split-brain.

## Scope boundary

- HAMR **Layer-1** (provider wrapper, governance-context injection, fleet-direct-block, bypass
  detection) is **out of scope** — unaffected by tier selection.
- This contract governs **Layer-2 coordination** routes only (mailbox, merge-claim, fleet-claim,
  bundle, MCP-dispatch, quota, cache-stats, substrate-health, review-run, rotation-check).

## References

- Phase-0 synthesis (route mappings, atomic ref-CAS, rate-limit budget): `research/github-cross-team-communication-2026-05-31.md` (#2489)
- Substrate cost/observability mechanics: `instructions/hamr-routing.instructions.md`
- Cross-team artifact-write sign-off: `instructions/cross-team-artifact-write.instructions.md`

## Cross-family rater verdict (AC-R5)

Cross-family review: **gemini-2.5-flash@google-ai-studio — ACCEPT, 9/10, grade A** (qwen-32b fleet
host DOWN — documented substitution; both non-Anthropic = valid cross-family vs the claude-code author).
Tier taxonomy sound, substrate-defaults justified, fallback robust; min(G1..G10) ≥ 7 met.

**Phase-1 verification item** (flagged by the rater): the "both modes satisfy the same logical
contract → same governance evidence" claim assumes the HAMR implementation replicates each
GitHub-native route's governance attributes. Phase-1 must prove this **per route** (parity test) before
flipping a route's default; it is asserted here as the contract target, not yet verified.
