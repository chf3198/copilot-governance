# Cross-Team R&D Synthesis (v3)

Canonical pattern for any Epic that warrants multi-team R&D synthesis. Lead-team baton ownership + iterative-debate-with-evidence + adaptive termination.

**Supersedes** v2 at `research/cross-team-rd-protocol-v2-2026-05-09.md` (now marked SUPERSEDED-BY-v3). Original v1 at `planning/protocol.md` was deprecated 2026-05-09 after #1131 SYNTHESIS_ABANDONED; left in place as archeological reference.

## §1 Lead-team baton ownership

One team owns the full Agile baton for the R&D ticket (Manager → Collaborator → Admin → Consultant). Other teams participate ONLY as collaborators in the R&D content; they have no baton role and no admin/consultant authority on that ticket.

**Lead-team selection** is substrate-derived: the substrate of the session that initiates the R&D = the lead team. Operator override via `--lead-team <code>` CLI flag for exceptional cases. Substrate-team mapping per `inventory/team-model-signatures.json` `substrateTeamMap`.

**Admin-role rotation** within Phase-D (v3 delta per #2394 conclusion): `admin_team = teams[ticket_N % len(teams)]`. With 4 teams cycling, each team is admin 25% of runs. Operator override via `--admin-team <name>` CLI flag. Lead-team Manager + Collaborator + Consultant remain on the lead team; only Phase-D admin facilitation rotates.

## §2 Phase order

| Phase | Description | Termination |
|---|---|---|
| Pre-flight | Identity verification (substrate-first per #2370 validator) | All teams confirm |
| Phase-R | Independent first-pass; NO peer-read; mandatory websearch | RD-COMPLETE signal |
| Phase-D | Iterative debate waves; admin posts WAVE_SUMMARY per wave | K-S adaptive stability (p<0.05 across N=3 consecutive waves) OR 24h hard ceiling (whichever triggers first) per #2396 |
| Phase-C | Lead-team baton closeout | CONSULTANT_CLOSEOUT artifact |

## §3 Pre-flight: identity verification

Each session before posting MUST verify substrate:

1. Identify the active extension/substrate (`github-copilot`, `codex-vscode-ide`, `codex-cli`, `claude-code-cli`, `google` (antigravity), etc.).
2. Team identity = substrate-derived per `substrateTeamMap` in `inventory/team-model-signatures.json`, NOT model-derived.
3. Alias seed = `expectedAliasFor({team, model, role})` from `scripts/global/megalint/signer-registry-check.js`. Antigravity Apollo, Claude Code Orla, Codex Quill, Copilot Orion/Soren/Milo/Coda per model.
4. Sign every artifact with the substrate-correct (team, model, role) alias. The `scripts/global/megalint/cross-team-response-fidelity.js` validator (shipped #2370) catches signer-team-vs-from-team mismatches at CI.

## §4 Phase-R: independent first-pass

### Rules

- **No peer reads** — independence is the entire point.
- **No seeded R&D** — only the goal/task/issue text is the input.
- **WebSearch MANDATORY** — opening plan cites ≥5 web sources with `websearch: <URL> (accessed <ISO-8601-UTC>) — <one-line gist>`.
- **Repo evidence MANDATORY** — ≥10 `repo: path/file.ext#L<start>-L<end>` anchors.
- **Contamination declaration MANDATORY** — every artifact starts with declaration of what the author has read before authoring.

### Output

`planning/synthesis-<rdN>/artifacts/<team>-rd.md` where `<rdN>` is the R&D ticket number.

### A2A envelope wrapping (v3 delta)

When inter-team coordination happens via mailbox (Tier 2) or git-board (Tier 1) per §6, each message is wrapped in a Google Agent2Agent envelope:

```json
{
  "task_id": "synthesis-<rdN>-wave-<n>-<from>-<to>",
  "task_state": "pending|in_progress|completed|failed",
  "from": "<source-team>",
  "to": "<target-team>",
  "payload": "<artifact-content-or-reference>",
  "timestamp": "<ISO-8601-UTC>",
  "signer": "<derived-alias>"
}
```

This aligns the harness with the Linux-Foundation-governed A2A protocol (150+ org backing as of 2026-05) for cross-framework interop.

### Length target

200-400 lines per artifact. Less than 200 likely lacks evidence depth; more than 400 is harder to debate.

### Signal completion

```
RD-COMPLETE: <team> as <alias>, <team:model@substrate>, <line-count> lines,
N=<websearch-count> websearch citations, N=<repo-evidence-count> repo anchors.
```

## §5 Phase-D: iterative debate

### Wave mechanics

Each wave is bounded — operator dispatches a wave; teams have up to **1 hour to respond**. Teams that finish faster signal completion immediately; admin proceeds when all teams report wave-complete or 1h elapses.

### Dispatcher (v3 delta per #2393)

Hybrid: operator initiates Phase-R kickoff (substrate-derived lead-team); subsequent wave-N prompts and admin snapshots are harness-driven via:

- **Tier 1 (default)**: `.gnap/dispatch/<team>/<ts>.json` committed to the issue branch; per-team session-start hooks read their inbox. Format follows GNAP (Git-Native Agent Protocol RFC, farol-team).
- **Tier 2 (optimization)**: HAMR R2 Mailbox at `/mailbox/write` + `/mailbox/read` when `MEGINGJORD_HAMR_DISABLED` is unset and the worker is reachable. Falls back to Tier 1 transparently per #2400 tier-graceful degradation pattern.

### WAVE_SUMMARY schema

Admin posts per wave:

```yaml
WAVE_SUMMARY:
  wave_n: <int>
  decisions_proposed_this_wave: [<D-N>, <D-N+1>, ...]
  decisions_concurred_unanimous: [<D-N>, ...]
  decisions_with_active_debate: [<D-N> (cc concur; cp reject; cx concur-with-constraint), ...]
  weak_evidence_flags: [<D-N> (admin: <team> cited only blog source for <claim>; needs academic), ...]
  missed_websearches: [<topic> (admin: no team cited recent <2025+ source on <topic>), ...]
  K_S_stability_p_value: <float>  # per termination strategy §2
  next_wave_focus: <one-paragraph admin guidance>
```

### Iterative debate rules

- All teams MUST read all peer artifacts before posting wave-N response.
- Each wave-N response cites at least one new websearch OR rebuts an existing peer claim with new repo evidence.
- Admin actively challenges weak evidence and surfaces missed websearches; admin is NOT a passive moderator.

### Termination (v3 delta per #2396)

Hybrid: `min(adaptive_termination_signal, 24h_hard_ceiling)`.

Adaptive: Kolmogorov-Smirnov test on decision-distribution stability. When p < 0.05 across N=3 consecutive waves, declare stability and proceed to Phase-C. Implementation: pure Python K-S in admin snapshot script.

Hard ceiling: 24h from Phase-D start (was 72h in v1/v2; #1105 closed in 6.5h, evidence that 24h provides 4x headroom).

Operator override: `--no-adaptive` flag forces full-cap run for research-novelty Epics where stability is suspicious.

## §6 File-system shape (v3 delta per #2395)

```
planning/synthesis-<rdN>/
├── artifacts/
│   ├── <team>-rd.md          # Phase-R independent first-pass per team
│   └── <team>-rd-wave-<n>.md # Phase-D wave-N response per team
├── positions/
│   └── <team>.md             # Per-team append-only position log
├── decisions.md              # Admin-curated decisions with D-IDs
├── pulse.json                # Heartbeat for stability detection
├── status.md                 # Current wave + summary
└── stability.json            # K-S test state (per-wave p-values)
```

**Per-team-MD scheme is canonical** (#2395 conclusion: 9.3 mean vs alternatives). Survives 4-team fanout per #2388 cross-orchestrator compat suite evidence. Linear extension to 10+ teams without architectural change.

**Optional GNAP-board overlay** for industry interop: a `.gnap/positions/<team>/<turn>.json` mirror generated FROM the canonical per-team-MD by the snapshot job. Opt-in per-Epic via `--gnap-overlay` CLI flag.

**Central D-ID allocator**: admin allocates D-IDs in submission order. Teams propose decisions by title; admin assigns the ID and updates `decisions.md`. No collision possible because allocation is centralized.

## §7 Sign-off format

Per-decision teams sign with one of:

- **Concur** — full agreement
- **Concur-with-Constraint: <constraint>** — agreement bound by named constraint
- **Reject: <one-paragraph rationale>** — disagreement with evidence-grounded reasoning

Plus `Evidence: <websearch-or-repo-citation>` linking the position to the source.

Decision is finalized when all teams sign Concur OR Concur-with-Constraint with compatible constraints. Reject from any team triggers another debate wave.

## §8 Admin facilitation duties

Admin is the rotated team's Collaborator-role (per §1 rotation rule). Duties per wave:

- Read all team artifacts before posting WAVE_SUMMARY
- Challenge weak evidence (blog-only citations on technical claims, missing 2025+ sources)
- Surface missed websearches (technical topic not covered by any team's citations)
- Run K-S stability test on decision distribution; report p-value in WAVE_SUMMARY
- Decide next wave focus based on outstanding rejects + weak evidence
- DO NOT vote on decisions (admin is facilitator, not participant); admin's own team's vote comes through that team's regular position log

## §9 Phase-C: lead-team baton closeout

Lead-team Manager → Admin → Consultant per `instructions/role-baton-routing.instructions.md`:

- Manager: posts MANAGER_HANDOFF with synthesis-rdN reference; verifies all decisions finalized
- Admin: gates on rubric ≥7 across G1-G9 (Epic governance clause 1); CI green
- Consultant: independent critique; posts CONSULTANT_CLOSEOUT with rubric per goal-lens; emits Tier-3 goal-failure-escalation events to `~/.megingjord/incidents.jsonl` for any goal scoring <7

Implementation children for the parent Epic are filed by the lead-team Manager after Phase-C closes.

## §10 Tier-graceful degradation

Per `instructions/harness-goals.instructions.md` Tier-graceful degradation pattern (codified #2400):

- §5 dispatcher and §6 GNAP overlay use Tier-2 (HAMR R2) when available; fall back to Tier-1 (git-board, GitHub Actions schedule) when not
- §5 termination's K-S test runs locally (Tier-1) regardless of mailbox tier
- All harness validators (#2370 cross-team-response-fidelity, signer-fidelity, etc.) run at CI which is Tier-1 GitHub Actions

The fallback IS the default; the optimization IS the upgrade.

## §11 Operating discipline (summary)

1. Substrate-first identity (§3)
2. WebSearch mandatory in Phase-R (§4)
3. Per-team-MD file ownership; central D-ID allocator (§6)
4. Admin rotates per ticket-N mod team-count (§1)
5. Iterative debate with active admin (§5, §8)
6. K-S adaptive + 24h ceiling termination (§5)
7. A2A envelope wrap for inter-team messages (§4)
8. Tier-graceful degradation (§10)

## §12 Bootstrap: when v3 itself needs synthesis

When the protocol's own iteration requires multi-team R&D, the single-team-authored constraint applies (per v2 §11): the proposed v-next is authored by the lead team alone (no synthesis run for the synthesis-protocol redesign). Avoid the bootstrap loop. v3 was authored by Claude Code Team Orla Harper post Phase-0 children #2393-#2396 closure.

## §13 Validation

v3 is validated against ≥1 real Epic per Epic #1112 AC8 (#2407). First validation target candidate: Epic #2398 (resource-tier portability) — well-scoped, no in-flight contamination, would benefit from cross-team perspectives on the per-script tier classification.

## §14 Cross-team-response-fidelity validator (CI enforcement)

`scripts/global/megalint/cross-team-response-fidelity.js` (shipped #2370) enforces TEAM_RESPONSE signer-team-from-team match at CI. Synthesis runs MUST pass this validator at the Phase-C closeout PR; failures block merge.

Rules enforced:
- `team-response-signer-team-mismatch`: TEAM_RESPONSE `from: <team>` must match the signer's parsed `Team&Model:` team string
- `signer-alias-non-derived`: `Signed-by:` must equal the registry-derived alias for the asserted (team, model, role) tuple
- `missing-from-field`, `missing-signing-block`, `invalid-team-model`: structural completeness

The validator ships in advisory mode initially; promotion to blocking is a CI-workflow-config decision after one cycle of advisory soak per the validator-promotion convention.

Synthesis-run interaction: Phase-D wave responses that take the form of TEAM_RESPONSE artifacts (cross-team formal sign-off on a decision) are validated; Phase-D wave responses that are append-only position-log entries are not (those follow the §6 file-system shape and §7 sign-off format directly).

## §15 References

- Epic #1112 productization parent
- #2393 dispatcher Phase-0
- #2394 admin rotation Phase-0
- #2395 fanout Phase-0
- #2396 termination cap Phase-0
- #2397 umbrella R&D synthesis (28KB historical + industry + outside-the-box)
- #2400 tier-graceful degradation pattern
- #2370 cross-team-response-fidelity validator
- #1111 multi-team leases (parallel writes)
- #2388 cross-orchestrator compat suite (4-team parity baseline)
- A2A protocol (Linux Foundation; 150+ orgs as of 2026-05)
- GNAP RFC (farol-team git-native agent protocol)
- AutoGen v0.4 termination strings
- Kolmogorov-Smirnov adaptive stability detection (NeurIPS 2025)
