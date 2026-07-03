# Wiki Log
Append-only chronological record of wiki operations.
Each entry uses a parseable prefix for CLI filtering.

## Format
```
## [YYYY-MM-DD] operation | Subject
Brief description of what happened.
```

## [2026-05-06] governance | Harness Goal Constitution wiki concept (#1060, EPIC #1024)
Added `wiki/concepts/harness-goals.md` and indexed the canonical 9-goal
constitution: Governance, Quality, Zero Cost, Privacy, Portability, Resilience,
Throughput, Observability, Interoperability. This completes the wiki concept
artifact required by Epic #1024 after always-loaded instruction surfaces shipped
in #1030.

## [2026-05-06] research | IDE Proxy Shim R&D (#1021, EPIC #1020)
Research for Claude Code IDE proxy shim. Recommends LiteLLM proxy adoption as IDE backend (already supports Anthropic-compatible `/v1/messages`); 6-child sketch ~5d total. Latency budget ≤50ms p95 achievable. Fleet pass-rate ≥85% on complexity bands 1-2 is activation gate. Anthropic key never reaches fleet. Acceptance: ≥30% turn count routed non-Anthropic, ≥25% session cost reduction, zero quality regression on Premium-tier turns.

## [2026-05-06] research | Fleet & Cloud Resource Optimization R&D (#950, EPIC #949 re-scoped)
Re-scoped R&D dropping obsolete §1/§2 (delivered by #573/#765/#768). Active scope: §3 Tailscale Aperture, §4 CF AI 2026 catalog, §5 fleet-portability. Decision: keep LiteLLM as primary routing engine; Aperture deferred until beta exits. CF AI free tier (10K Neurons/day) registered as new named LiteLLM groups. 8-child sketch ~5.5d total.

## [2026-05-05] convergence | Megingjord Harness Convergence Design v1 (#922, 9-round 3-team SIGN_OFF)
Approved cross-team architecture: 4 axes (governance / tooling / fleet / HAMR) plus Dashboard as observation/control plane. HAMR is shared substrate maintained by Claude Code Team. substrate-health gates model-routing-engine UPSTREAM of cascade-dispatch via cascade-policy-overrides.json. Per-team config markers extended with axis_consumers. SKILL.md frontmatter is canonical tool-discovery format with auto-derived per-team views. Cross-team edits on shared files via baton + governance-lint warn. megingjord-coord deprecation and Dashboard HAMR opt-in (#966) deferred to downstream Epics. 3 consecutive SIGN_OFFs (Codex/Copilot/Claude Code) at rounds 7/8/9. Authored as fast-track operator-deputy passes per operator authorization.

## [2026-05-09] ingest | Epic #1271 Codex R&D plan (#1274)
Added raw/source/concept wiki coverage for Epic-state truthfulness. The normal
`npm run wiki:ingest` path was attempted, but OpenClaw ingest was unreachable;
Codex completed the source summary and concept page manually using the same
Karpathy wiki structure. New pages: `wiki/sources/epic-1271-cx-rd-plan-2026-05-09.md`
and `wiki/concepts/epic-state-truthfulness.md`.

## [2026-05-09] ingest | Epic #1271 Copilot R&D plan (#1273)
Added raw/source coverage for Epic-state truthfulness with the same fallback
pattern when OpenClaw ingest was unreachable. New page:
`wiki/sources/epic-1271-cp-rd-plan-2026-05-09.md`. Updated concept linkage in
`wiki/concepts/epic-state-truthfulness.md` and index entries in `wiki/index.md`.

## [2026-05-10] research | Epic #1271 Codex FDPR (#1286)
Added the Codex final development plan recommendation after peer critique from
Claude Code and Copilot. New source page:
`wiki/sources/epic-1271-codex-fdpr-2026-05-10.md`. The FDPR recommends
governance-first Wave 1 controls with a portable AC schema as canonical truth,
and GitHub 2026 platform features as adapters.

## [2026-05-13] research | Codex compatibility audit (#1476)
Added the Codex Team compatibility audit covering harness goals, routing,
HAMR activation, runtime deployment, Codex config, AGENTS.md review behavior,
and OpenAI/Codex telemetry. New source page:
`wiki/sources/codex-compatibility-audit-2026-05-13.md`. Source:
`research/codex-compatibility-audit-2026-05-13.md`.

## [2026-05-14] research | Provider adapter matrix (#1485, EPIC #1480)
Added runtime-vs-provider matrix for Codex, Claude Code, Copilot, OpenClaw,
fleet, HAMR, OpenAI-compatible, Anthropic, Ollama, OpenRouter, and LiteLLM.
New source page: `wiki/sources/provider-adapter-matrix-2026-05-14.md`.
Source: `research/provider-adapter-matrix-2026-05-14.md`.

## [2026-05-16] governance | Provider-neutral governance contract (#1623, EPIC #1604)
Added shared governance contract with Codex, Copilot, and Claude Code adapter
sections. Source: `research/issue-1623-provider-neutral-governance-2026-05-16.md`.
Wiki page: `wiki/sources/provider-neutral-governance-2026-05-16.md`.

**Tip**: `grep "^## \[" log.md | tail -5` shows last 5 entries.

---

## [2026-05-05] ingest | VS Code Copilot allow-prompt avoidance (Epic #849)
Added workspace-trust + approvals research to the Karpathy wiki so sessions can
avoid repeated "Allow" interruptions. New pages:
`wiki/sources/vscode-copilot-allow-prompts-2026-05-05.md` and
`wiki/concepts/workspace-write-boundary-discipline.md`. Core policy: keep writes
inside repo workspace root and never edit runtime homes directly from this repo
session; use repo-mediated deploy flow instead. Source:
research/dashboard-liveness-workspace-trust-2026-05-05.md.

## [2026-05-05] ingest | Dashboard live-data methodology (Epic #849)
Added dashboard liveness contract source page documenting SSE vs polling split,
panel refresh cadence, staleness signaling, and forced refresh on delayed-mount
views. New page: `wiki/sources/dashboard-live-data-methodology-2026-05-05.md`.
Source: research/dashboard-live-data-patterns-2026-05-05.md.

## [2026-05-05] research | HAMR v3.2.2 patch — R9.2 cwd-vs-branch hook enforcement (#923, EPIC #860)
Pre-Wave-4 alignment patch extending v3.2.1 §R9.2 with three sub-patterns:
R9.2.1 Bash-hook contract (pre-tool guard asserts HEAD non-detached + no
in-progress rebase + branch matches EXPECTED_BRANCH); R9.2.2 `gh pr create`
MUST pass explicit `--head <ref>` flag (cwd-resolved head BANNED); R9.2.3
branch-ops audit log at ~/.megingjord/branch-ops.log. Triggered by 3
empirical hazard occurrences during HAMR Waves 1–3 (PR cwd-resolution
landing commits on wrong/Copilot branches). Implementation deferred to a
separate development child ticket spawned post-merge. Source:
research/hamr-v3-2-2-2026-05-05.md.

## [2026-05-05] research | HAMR v3.2.1 patch — R9 + §R6 update + Copilot coordination (#907, EPIC #860)
Pre-Wave-2 alignment patch amending v3.2 (#890). Bundles three deltas:
(1) R9 NEW cross-level resource-failure recovery — four Wave-1-validated
patterns (worktree-isolation, cwd-vs-branch pre-flight, sequential dispatch
with backoff + family-fallback, idempotent infrastructure tear-down);
(2) §R6 binary→3-stage gate (Stage-1 deterministic ≥99% keyword unchanged;
Stage-2a free-fleet ≥80% direct+counter-factual; Stage-2b paid-tier ≥95%
with boundary; Stage-3 operator review for <0.50). v3.2 §R6 ≥97% threshold
unachievable per #893 finding;
(3) Copilot Team v2.0 baton-routing coordination note (Wave-5 sync required;
not Wave 2/3/4 blocking). v3.2 stays unmodified; v3.2 + v3.2.1 are combined
input contract for Wave 2. Source: research/hamr-v3-2-1-2026-05-05.md.

## [2026-05-05] validation | HAMR Wave 1 S5 Stage-2 reasoning quiz (#893, EPIC #860)
60-Q quiz authored across direct (30) / counter-factual (20) / boundary (10);
20-Q balanced subset run via judge-quorum.js #895 with Cerebras qwen-3-235b
(family qwen, with Gemini-2.5-flash fallback) and Groq llama-3.3-70b (family
llama). Direct mean 0.55 (30% ≥0.97 / 80% ≥0.50); counter-factual mean 0.50
(33% / 67%); boundary 0% (judges did not chain reasoning). Family-fallback
Cerebras → Gemini covered 14/14 queue-exceeded calls — architecture VALIDATED.
v3.2 §R6 ≥97% threshold is NOT achievable with free-fleet quorum; REVISE to
3-stage gate (Stage-2a free-fleet ≥80% direct+counter-factual; Stage-2b paid
≥95% including boundary; Stage-3 operator review). Net spend $0 (free fleet).
Source: research/hamr-wave1-s5-stage2-2026-05-05.md.

## [2026-05-05] validation | HAMR Wave 1 S3 — Live CF Worker + KV latency (#891, EPIC #860)
Live throwaway Worker + KV deploy at hamr-spike.chf3198.workers.dev. R2 substituted
with KV (R2 needs one-time operator dashboard ToS; KV is same Workers-Paid plan,
same bound-storage round-trip). 60 samples (30 cold + 29 warm after dropping
prime call). Measured cold p50 114.6 / p95 153.3 ms (within v3.2 §R4 ≤180 ms p95);
warm p50 37.4 / p95 45.4 ms (BEATS v3.2 §R4 ≤80/120 ms by ~2×). Decisions: CONFIRM
v3.2 §R4 thresholds; revise `npx megingjord init` sample to 40 ms p50 / 50 ms p95;
HTTP/2 keepalive + KV edge-cache mandates ratified; R2 enablement deferred to
operator dashboard step (add to hamr:doctor remediation list). Tear-down verified
HTTP 404. Net subscription cost $0. Source:
research/hamr-wave1-s3-live-deploy-2026-05-05.md.
## [2026-05-05] validation | HAMR Wave 1 S4 — Live Anthropic cache measurement (#892, EPIC #860)
20 live calls to claude-sonnet-4-5 with 14,073-token HAMR governance bundle
(instructions/* + 4 wiki concept pages). Total spend $0.18 (under $0.50 cap).
Measured reductions: 5m ephemeral 83.82% (1 write + 9 reads, 90% hit), 1h
extended 90.59% (10 reads, 100% hit on warm cache). Both EXCEED v3's 72%
claim (+11.8 pp / +18.6 pp). CONFIRM v3 §R5: 1-h extended cache as default;
80% hit-rate floor preserved; ≥5 min bundle-rebuild rate-limit unchanged.
Source: research/hamr-wave1-s4-live-cache-2026-05-05.md.

## [2026-05-04] research | HAMR v3.2 — post-spike redesign baseline (#890, EPIC #860)
Design baseline after the 6-spike validation gate. Substrate (CF Worker + R2
+ KV + MCP + Tailscale fleet) survives; trust model, latency contract, cache
strategy, compression gate, key storage, judge gate, and failover semantics
are revised. 8 remediations (R1–R8). 4-tier OS-agnostic key store (T1
hardware enclave → T2 OS keychain → T3 Age file → T4 ephemeral). Quorum-of-2
judge gate with provenance tag (replaces v3.1 cloud-only wording). Explicit
3-tier graceful-degradation map (Tier 3 = today's harness; HAMR is strict
superset). Revised 9-child MVP across 5 waves (~18 working days). Wave 1
children filed as #891–#896. Source: research/hamr-v3-2-2026-05-04.md.
Supersedes: research/hamr-v3-2026-05-04.md.

## [2026-05-04] research | HAMR Spike S4 — Anthropic prompt-cache economics (#879, EPIC #860)
Lane converted from code-change to docs-research after env check showed no
`ANTHROPIC_API_KEY`; live measurement deferred. Analytical validation of v3's
72% effective token-cost reduction claim using Anthropic's published cache
pricing (write 1.25×, read 0.10×, 5-min ephemeral / 1-h extended). Decision:
**CONFIRM v3's 72% claim** — derives 73.5% at 10-call session, 83.3% at
100-call, 65.6% at 5-call (all meet ≥72% target when hit rate ≥80%).
Recommend 1-h extended cache for HAMR's 15-60 min session shape; bundle-
rebuild cadence must be rate-limited to ≥5 min for ephemeral amortization.
Spike script + operator-run instructions documented in §5 (gitignored). Spend
expected ~$0.07 (under $0.50 cap). Source:
research/hamr-spike-s4-prompt-cache-2026-05-04.md.

## [2026-05-04] research | HAMR Spike S3 — Substrate latency analysis (#878, EPIC #860)
Lane converted from code-change to docs-research after S2 #877 capability probe
showed operator environment has no Wrangler/R2; live deploy deferred. Measured
+ cited per-segment latency budget. Verdict: **REVISE** v3's ≤80 ms claim —
cold paths measure 108–116 ms p50 (exceed by 28–36 ms); warm cache-hit paths
hit 54 ms p50 / 80 ms p95 (satisfy claim). Required revisions: scope claim to
warm-connection only, mandate HTTP/2 keepalive, mandate KV edge-cache via
Cache-Control headers, revise `npx megingjord init` 60 ms sample. Tailscale
fleet RTT: windows-laptop 5 ms, 36gbwinresource 11 ms, penguin-1 64 ms p50.
Source: research/hamr-spike-s3-latency-analysis-2026-05-04.md.

## [2026-05-04] research | HAMR Spike S6 — Build-vs-adopt + STRIDE threat model (#881, EPIC #860)
Two-part deliverable: (a) per-child build-vs-adopt matrix for the 9 surviving
HAMR MVP children — counts ADOPT 2 / BUILD 4 / HYBRID 3 / REUSE 0; one
license-incompatible library flagged (TruffleHog AGPL-3.0, rejected as direct
dep); (b) formal STRIDE threat model across 5 adversary classes × 6 STRIDE
categories — 9 of 30 cells residual MEDIUM or HIGH after existing mitigations.
Four required HAMR design changes (DC-1: signed A2A mailbox envelopes; DC-2:
slsa-verifier pre-MCP-connect; DC-3: hardware-bound DPoP key; DC-4: signed
baton handoff artifacts + non-fleet judge gate). Sources:
research/hamr-spike-s6-build-vs-adopt-2026-05-04.md and
research/hamr-spike-s6-threat-model-2026-05-04.md.

## [2026-05-04] research | HAMR Spike S5 — Distillation rule-coverage (#880, EPIC #860)
Empirical compression-vs-rule-coverage curve for our 22,480-char governance
text. Two methods tested in parallel: deterministic top-k extractive (47-
keyword vocabulary) and Cerebras llama3.1-8b LLM rewrite. Both saturate at
~32% of source size (≈68% tokens saved) before hitting an irreducible-rule
floor. 20-question quiz graded by Cerebras llama3.1-8b scored 20/20 at every
level on both methods. Decision: REVISE v3's ≥97% target upward to ≥99%
keyword-coverage; introduce two-stage gate (cheap keyword + periodic
reasoning-grounded). Source: research/hamr-spike-s5-distillation-2026-05-04.md.

## [2026-05-04] research | HAMR Spike S1 — Existing Code Audit (#876, EPIC #860)
Audit of 20 modules against HAMR v3 13-child MVP plan. Decision counts:
REUSE 3, REFACTOR 11, REPLACE 3, MERGE 3. Revised HAMR child count: 9
(down from 13). Four prospective children absorbed into refactors of
`cascade-dispatch.js`, `model-routing-engine.js`, `litellm-client.js`,
`token-provider-adapters.js`, `wiki/anneal.js`. Three modules slated for
REPLACE: `agent-coord-remote.js`, `cloudflare/worker.ts`,
`cloudflare/durable-object.ts`. Source: research/hamr-spike-s1-code-audit-2026-05-04.md.

## [2026-05-03] update | Token telemetry drift reconciliation (#774)
Implemented and validated reconciliation + alerting harness for request-vs-aggregate token drift.
Added provider lane and confidence-impact fields, dashboard reconcile panel, and test coverage.
Validation evidence captured from capability probe, cloud provider probes, and fleet benchmark
(including 36gbwinresource performance and OpenClaw preflight result).

## [2026-04-13] init | Wiki system scaffolded
Phase 1 foundation created. Directories: raw/, wiki/, scripts/wiki/.
Schema: WIKI.md. No sources ingested yet.

## [2026-04-14] ingest | "Karpathy LLM Wiki Pattern"

## [2026-04-14] ingest | DevEnv Fleet Topology

## [2026-04-14] ingest | Copilot Skills System

## [2026-04-14] bulk-ingest | 20 research files → wiki/sources/
Batch ingest of all research/*.md files into wiki source pages.
Files: agent-drift (7), agile-roles (2), copilot-governance,
dashboard-research, free-tier-inventory, hardware-evaluation,
help (2), prompt-reduction, tiered-architecture (2), workflow (2).
Epic #85 ticket #86. Total wiki pages now: 23.

## [2026-04-14] create | 5 entity pages + 5 concept pages
Entities: penguin-1, windows-laptop, openclaw, tailscale-mesh,
copilot-pro. Concepts: baton-protocol, agent-drift,
self-annealing, wiki-pattern, governance-enforcement.
Cross-linked with [[wikilinks]]. Epic #85 ticket #87.
Total wiki pages now: 33.

## [2026-04-18] create | Dashboard Codebase Gold Rules
Synthesis from deep audit of 40 JS files. 10 gold rules
covering namespace isolation, error handling, Alpine v3 API,
Playwright config, script loading. Epic #290.

## [2026-04-23] ingest | LLM Wiki Optimal Implementation Plan
Research synthesis from web sources: Anthropic Claude Code Best Practices
(2026), Mem0 April 2026 memory algorithm, Lilian Weng agent taxonomy,
Karpathy/Lutke context engineering (Jun 2025). Five gaps identified in
current wiki implementation with tiered P0/P1/P2 remediation plan.
Total wiki pages now: 51.

## [2026-04-23] ingest | OpenClaw Windows optimization and alternatives
Research synthesis added from LiteLLM reliability/routing docs, Ollama API,
llama.cpp performance guidance, and LocalAI overview. Captures decision to
keep OpenClaw as control plane and harden endpoint reliability/fallbacks.
Total wiki pages now: 52.

## [2026-04-23] update | Windows OpenClaw endpoint hardening
External IT lane completed on windows-laptop: OpenClaw gateway changed from
loopback `127.0.0.1:18789` to tailnet `100.78.22.13:4000`, restoring fleet
health probe success at `/health` and unblocking harness hardening work.

## [2026-04-23] ingest | Fleet live usage indicator options
Research captured for low-resource live visibility on fleet devices.
Validated on-demand model runtime behavior and recommended terminal-first
indicator with optional browser mirror. Total wiki pages now: 53.

## [2026-04-23] update | Fleet warm-pool guidance
Added validated `keep_alive` warm-pool guidance and clarified that terminal
log/`ollama ps` views provide low-overhead live activity visibility.

## [2026-04-23] update | Fleet indicator UAT stress harness
Implemented single-line terminal rendering to prevent scrollback growth and
added bounded stress scripts (`.sh` and `.js`) for operator UAT validation.

## [2026-04-23] ingest | Global governance self-anneal
Formal governance anneal report added with root-cause/risk analysis and
instruction hardening actions for baton, epic closure, and divergence triggers.
Total wiki pages now: 54.

## [2026-04-23] update | Governance anneal web corroboration
Backfilled external GitHub Docs evidence for issue lifecycle, label governance,
and PR-linked auto-close semantics; updated research and wiki source references.

## [2026-04-23] ingest | Cost→quality self-anneal research
Added web-corroborated cost-benefit analysis for model routing, CI path filters,
concurrency, caching, and selective test execution. Created implementation-ready
task set (#144–#146). Total wiki pages now: 55.

## [2026-04-23] ingest | Governance workflow hardening design
Added web-refreshed governance research for protected branches, merge queues,
and project automation. Finalized design and created implementation tickets
(#151–#154). Total wiki pages now: 56.

## [2026-04-23] ingest | Governance verification harness checklist
Added executable pre-close governance verification script and evidence checklist
for Admin/Consultant closeout phases. Total wiki pages now: 57.

## [2026-04-29] ingest | Sandbox worktree governance pack
Added source+synthesis pages for launcher-branch controls, reset workflow, and merge-group-safe CI governance checks.
Last updated with supporting research and runbook alignment.

## [2026-04-30] shipped | Sandbox launcher sync (#647)
`.github/workflows/post-merge-sandbox-sync.yml` merged: fires on push to main, force-resets
all sandbox/* branches via GitHub REST API. Closes the "guardian without a keeper" invariant
hole in worktree-governance-required CI gate.

## [2026-04-30] shipped | Governance drift detection (#360)
`scripts/global/governance-drift-classifier.js` + 11-test spec + daily CI workflow merged.
Classifies governance issues into open/terminal/epic drift classes; writes JSON report to
`logs/governance-drift.json`. `npm run governance:drift` for manual runs.

## [2026-04-30] shipped | Fleet remediation runner evidence pack (#595)
`scripts/global/fleet-benchmark-runner.js` + `fleet-rollout-runner.js` confirmed in main
(merged earlier via PR #596 by Copilot team). Issue closed after Claude Code Team verified
2/2 tests pass.

## [2026-04-30] anneal | Wiki critical audit and structural repair (#651)
34 lint violations resolved: frontmatter fixed on 9 pages, ghost index entries removed
(linting-governance-rationale/tooling/rollout), 2 missing pages added to index,
type field pluralisation corrected on 7 pages. Model routing page updated
(Opus 4.6 → 4.7). Index rebuilt with correct page counts (62→65 with new synthesis).

## [2026-04-30] ingest | LLM Wiki state synthesis (2026)
New synthesis page `llm-wiki-state-2026.md` created from web research (16 sources).
Key findings: flat-markdown architecture validated at this scale; 5 improvements
recommended (confidence frontmatter, infra-automation routing, qmd search MCP,
typed wikilinks, frontmatter-only session map). Total wiki pages now: 65.

## [2026-04-30] update | wiki_router.py — infra-automation routing
Added `infra-automation` routing branch: devenv-ops sessions now inject fleet routing
order (from model-routing concept) and governance enforcement layers (from governance-
enforcement concept). Max snippets raised from 4 to 5. Synced to both runtimes.

## [2026-05-01] ingest | Drift Monitoring Strategy 2026-05-01

## 2026-05-01 — Fleet Hardware Optimization #734 ingested
Manual ingest: research/fleet-hardware-optimization-2026-05-01.md → wiki/sources/fleet-hardware-optimization-2026-05-01.md
Cross-linked: 36gbwinresource, openclaw, penguin-1, fleet-architecture, cascade-dispatch, model-routing

## [2026-05-01] ingest | Multi-Agent Dashboard Design (Epic #742)
Cerebras llama3.1-8b design Q&A: CSS Grid auto-fill layout, N>3 overflow badge, browser-tab-only heartbeat, JSON schema {vendor,agentId,branch,ticket,activity,ts,tier}.
Canonical files: research/multi-agent-dashboard-design-2026-05-01.md → wiki/sources/multi-agent-dashboard-design-2026-05-01.md
Epic #742 closed. PR #777 merged. Version v3.3.0 tagged.

## [2026-05-01] ingest | Token Telemetry Capability Matrix (Epic #768 research gate)
Evidence-backed provider capability matrix and unified design synthesis created.
Covers: Anthropic, OpenRouter, LiteLLM, Gemini, Ollama (exact), Copilot (estimated).
Canonical schema and confidence policy defined. Implementation children #769-#774 created.
Total wiki pages now: 66.

## 2026-05-01 — Paid Token Floor Reduction #782 ingested
Manual ingest: research/paid-token-floor-reduction-2026-05-01.md → wiki/sources/paid-token-floor-reduction-2026-05-01.md

## [2026-05-01] ingest | Fleet Resource Audit + Hardware Optimization
Live fleet audit + hardware optimization findings (post-IT pass 2026-05-01).
Source files: raw/articles/fleet-resource-audit-2026-05-01.md, research/fleet-hardware-optimization-2026-05-01.md, research/multi-agent-command-center-round-2-2026-05-01.md.
Wiki pages: wiki/sources/fleet-resource-audit-2026-05-01.md, wiki/sources/fleet-hardware-optimization-2026-05-01.md, wiki/sources/multi-agent-command-center-round-2-2026-05-01.md.

## [2026-05-02] update | Fleet entities refreshed (#803)
Updated wiki/entities/{36gbwinresource,openclaw,penguin-1}.md to reflect SYSTEM-service Ollama operating mode, current model lineups, and per-request keep_alive: "24h" pattern. Architecture map (docs/ARCHITECTURE.md) and DECISIONS index updated; WIKI.md and wiki-knowledge instruction now document the wiki:ingest pipeline; new docs/howto/contribute-to-wiki.md walks contributors through it.

## [2026-05-02] ingest | Codebase organization 2026-Q2 research (#819)
Source: research/codebase-organization-2026-05-02.md / raw/articles/codebase-organization-2026-05-02.md / wiki/sources/codebase-organization-2026-05-02.md.
Manual ingest (fleet LLM endpoints returning HTTP 400 at ingest time). Spawned implementation children #820, #821, #822 under Epic #818.

## [2026-05-02] audit | Manager-side ticket audit pass (#836, #837 spawned)
Manager-authority audit across 18 open tickets. Deterministic governance scripts reported zero drift. LLM-grounded review (Groq llama-3.3-70b + Cerebras qwen-3-235b, free fleet) surfaced one real doc-drift (epic-governance vs ticket-driven-work contradiction → #836), one ticket-cluster boundary (#732/#766/#833), and one AC-tightening signal (#829). New wiki concept: ticket-audit-pattern. New tickets: #836, #837. Manager comments posted on #732, #766, #829, #833. Token cost: ~8 KB Claude / ~80 KB free fleet.

## [2026-05-03] shipped | Fleet matrix refresh automation + freshness gate (#833)
`scripts/global/routing-refresh.js` probes Groq/Cerebras/OpenRouter/Google + 3 Tailscale Ollama hosts; writes `.dashboard/routing-snapshot.json` + stamps matrix header. `scripts/global/matrix-freshness.js` fails CI on >60d staleness. `.github/workflows/model-matrix-refresh.yml` monthly cron + on-demand. 6 Playwright tests. 36gbwinresource qwen2.5-coder:32b drafted the change-summary section; zero paid LLM tokens.

## [2026-05-03] research | Parallel fleet access — global queue design (#781)
Manager-authority research deliverable for cross-team Tailscale fleet sharing. Decision: SQLite-WAL default substrate (#739) with optional Worker DO (#740/#788). Per-vendor skill/tool surfaces designed for Claude Code, Copilot, Codex, Continue.dev, Cursor, Aider. Heavy fleet usage: Cerebras 235B (Q5-Q10), 36gbwinresource qwen2.5-coder:32b (Q4), Groq llama-3.3-70b (Q1-Q3). Implementation children deferred to client review.

## [2026-05-04] research | Dashboard closed-state hygiene (#852)
Research-only deliverable for child of EPIC #848. Decision: Linear-style default-hide + toggle with Height-style condensed historical attribution. Single Groq llama-3.3-70b dispatch (zero paid LLM tokens). Implementation children NOT spawned — awaiting client review.

## [2026-05-04] research | Dashboard layout density heuristics (#854)
Research-only deliverable for child of EPIC #850. Produced per-panel sizing matrix and desktop/laptop/mobile wireframe baselines with panel consolidation rationale. Heavy fleet usage evidence captured from capability probe + routing refresh + fleet benchmark (36gbwinresource strongest throughput). Implementation children NOT spawned — awaiting client review.

## [2026-05-04] research | Fleet harness-awareness v2 (#863, EPIC #860, supersedes v1 #861)
2199-word revision addressing client's 6 considerations: fleet-agnostic three-tier fallback, bidirectional wiki via GitHub App + Yjs CRDT, multi-repo bound JWT identity, independent substrate-health probe, 9-row per-provider native caching matrix, R2-backed agent mailbox with Google A2A envelope. v1 happy-path substrate preserved; 9 implementation children identified (vs v1's 5). 24+ new primary-source citations. Heavy fleet usage via sub-agent + websearch.

## [2026-05-04] research | HAMR v3 — 5-axis optimization (#873, EPIC #860)
2226-word v3 research deliverable. Acronym formalized as **HAMR — Harness-Aware Mesh Routing**. Optimizes v2 design across security (SLSA-L3 + OIDC + Cosign Bundle 1.0 + MCP OAuth+DPoP + capability manifests), UX (npx init + magic-link OAuth + progressive disclosure + hamr:status), token-min (per-tier sub-bundles + JSON Patch + LLMLingua-2 distillation + structured outputs; ~80% reduction), paid-token min (Batch APIs 50% off + sticky cache routing + context-editing + header-driven spillover), maintenance (Wrangler 4.x + Tail Workers + R2 lifecycle + schema versioning). 4 new MVP children (SLSA pipeline, per-tier bundle generator, constitution compressor, Batch API). Heavy fleet usage via sub-agent + websearch.
