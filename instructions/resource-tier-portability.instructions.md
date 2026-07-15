# Resource-Tier Portability

Canonical definition of the resource tiers the harness recognizes, so every
feature can declare the environment it needs and degrade to the operator's
available tier. This file is the tier *taxonomy*; it does not restate the G5
contract or the optimal-with-fallback rule — those live in
`instructions/harness-goals.instructions.md` (G5 + "Tier-graceful degradation").
Source taxonomy: Phase-0 audit `research/resource-tier-taxonomy-audit-2026-05-30.md`
(#2412). Pattern origin: #2400. Parent: Epic #2398.

## Tier taxonomy

| Tier | Required resources (cumulative) | Opt-out / fallback signal |
|---|---|---|
| 0 | Local machine only — OS + Node + git + bash | none needed (always available) |
| 1 | Tier 0 + a GitHub account (the harness baseline) | `git`-board / local-state fallback |
| 2 | Tier 1 + Cloudflare Workers (HAMR) | `MEGINGJORD_HAMR_DISABLED=1` |
| 3 | Tier 2 + Tailscale mesh + fleet hardware | `MEGINGJORD_FLEET_DIRECT_BLOCK=1` |
| 4 | Tier 3 + paid LLM provider keys | provider cascade falls to local/free lane |
| 5 | Tier 4 + enterprise services (managed-agent platforms) | feature disabled when absent |

`MEGINGJORD_MCP_DISABLED=1` additionally gates MCP capability dispatch (a Tier-2
surface) independently of the HAMR opt-out.

## Baseline and the binding rule

- **Tier 1 is the harness baseline.** Phase-0 found 95.1% of `scripts/global/*.js`
  are Tier-0/1; only 16 scripts sit above baseline, and all carry a documented
  opt-out or graceful fallback (no G5 violations).
- **Tiers map directly onto G5.** Every tier above the operator's baseline is a G5
  "baseline-absent resource"; a feature's declared tier is precisely the input the
  G5 opt-in-or-fallback requirement gates on. This taxonomy is the vocabulary for
  that contract — it does not change it.
- A feature that uses a Tier-2-or-higher resource MUST, in the same change, ship a
  fallback to the lowest available tier (the tier-graceful rule in
  `harness-goals.instructions.md`). The fallback is the default; the higher tier is
  the optimization.
- "Absent" (G5: this operator never has the resource) and "unreachable" (G6: normally
  present, currently down) lead to the **same** fallback path.

## MEGINGJORD_MINIMUM_TIER (design intent — not yet enforced)

Operators will assert the highest tier their environment guarantees via
`MEGINGJORD_MINIMUM_TIER=<0-5>`. A feature requiring a tier above the asserted
minimum must take its fallback path rather than assume the resource.

- Enforcement (`scripts/global/tier-assert.js`, consulted by `pretool_guard.py` and
  each Tier-2+ script) is a **separate Phase-1 child** of Epic #2398 — do not
  implement it here.
- Until that ships, the asserted minimum is interpreted from the operator's
  documented baseline, and the same-PR-fallback rule is reviewer-enforced.
- Open question carried from Phase-0: whether `MEGINGJORD_MINIMUM_TIER=0`
  (air-gapped, no GitHub) is supported, given ticket-IS-the-baton assumes Tier 1.

## Declaring a feature's tier

- Scripts/features SHOULD declare their tier (a `tier:N` frontmatter/comment tag is a
  separate Phase-1 child; the `tier-assert` enforcer and the
  `docs/howto/resource-tier-feature-matrix.md` matrix consume these declarations).
- A CI validator scanning PR diffs for Tier-2+ dependencies lacking a Tier-1 fallback
  is tracked as an Epic #2398 follow-on; until then this is a code-review gate.

## References

- `instructions/harness-goals.instructions.md` — G5 contract + Tier-graceful pattern.
- `research/resource-tier-taxonomy-audit-2026-05-30.md` — Phase-0 #2412 audit.
- `instructions/hamr-routing.instructions.md` — Tier-2 (HAMR) mechanics.
- `instructions/global-task-router.instructions.md` — Free/Fleet/Haiku/Premium lanes.
- #2400 tier-graceful degradation pattern · Epic #2398 resource-tier portability.
