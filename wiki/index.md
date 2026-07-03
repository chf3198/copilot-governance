# Wiki Index

Content-oriented catalog of every page in the wiki.
The LLM updates this on every ingest operation.

## How to Use

1. LLM reads this file first when answering a query.
2. Find relevant pages by category, then drill into them.
3. At moderate scale (~100 sources, ~hundreds of pages), this avoids
   the need for embedding-based RAG infrastructure.

## Storage Layout (Three-Wiki typology — Phase-1 stubs from #2051)

Per `research/three-wiki-typology-synthesis-1943.md`, the wiki is organized into four scopes:

- **`wiki/code/`** (Wiki A) — Code-Base Wiki (per-project, committed). Symbols + concepts derived from this repo's source code. Stub only until Phase-1 child #2053 ships ingestion logic.
- **`wiki/work-log/`** (Wiki B) — Project Work-Log Wiki (per-project, committed). Mirror of GitHub tickets + PRs. Stub only until Phase-1 child #2054 ships ingestion logic.
- **`wiki/wisdom/project/`** (Wiki C scope=project) — Project-specific research-based wisdom (per-project, committed, NEVER distributed cross-project). Phase-0 research+planning syntheses land here (e.g. Epic #2091 will land its Phase-0 synthesis at `wiki/wisdom/project/research/harness-state-isolation.md`).
- **`wiki/wisdom/global/`** (Wiki C scope=global) — Cross-project wisdom (committed in this repo, distributed to operator-global `~/.copilot/wiki/`). Contains `concepts/`, `entities/`, `sources/`, `syntheses/`, `skills/` subdirectories (migrated from legacy paths by #2098).

Each subtree has a README.md documenting its purpose.
## Work Log

Mirror of GitHub tickets + PRs. Wiki B pages are written here by the shared wiki I/O layer and keep the work-log catalog distinct from the legacy research pages below.

## Entities

- [[penguin-1]] — Penguin-1 (SML Chromebook)
- [[windows-laptop]] — Windows Laptop (OpenClaw Host)
- [[openclaw]] — OpenClaw Gateway
- [[tailscale-mesh]] — Tailscale VPN Mesh
- [[copilot-pro]] — GitHub Copilot Pro
- [[36gbwinresource]] — 36GB Windows Resource (primary fleet inference node)

## Concepts

- [[epic-state-truthfulness]] — Epic-state truthfulness and AC reconciliation controls
- [[baton-protocol]] — Baton Protocol (Role Handoff) [v1.0]
- [[ticket-lifecycle-v1]] — Ticket Lifecycle v1.0 — Agent-Typed Model
- [[epic-governance]] — Epic Lifecycle Governance Rules
- [[agent-drift]] — Agent Drift
- [[self-annealing]] — Self-Annealing Protocol
- [[distributed-self-anneal]] — Three-tier distributed self-anneal (Epic #1308)
- [[andon-pull-protocol]] — Any-role pull mechanics + pivot semantics (Epic #1308)
- [[harness-logging-inventory]] — Logging surface inventory + G1..G9 coverage map (Epic #1339)
- [[megingjord-harness]] — Megingjord Harness top-level overview (rebranded from DevEnv Ops 2026-04-29)
- [[cascade-dispatch]] — Bounded escalation pattern (Free → Fleet → Haiku → Premium)
- [[free-router]] — Lane-selection layer above cascade-dispatch
- [[wiki-pattern]] — Karpathy LLM Wiki Pattern
- [[governance-enforcement]] — Governance Enforcement
- [[protocol-enforcement]] — Protocol Enforcement Architecture
- [[context-flow]] — LLM Context Flow Through Fleet
- [[model-routing]] — AUTO Selection & Fleet Distribution
- [[github-integration]] — GitHub API Integration & Dashboard Monitoring
- [[linting-governance]] — Global Linting Governance
- [[fleet-architecture]] — Fleet Architecture Overview
- [[workspace-write-boundary-discipline]] — Workspace Write-Boundary Discipline
- [[harness-goals]] — Harness Goal Constitution
- [[harness-goal-controls]] — G1..G9 enforcement primitives + evidence signals (aggregated map)
- [[epic-ac-reconciliation]] — Epic AC Reconciliation pattern (auto-reconcile checkboxes vs evidence)

- [[1h-extended-cache-cadence]] — 1h Extended Cache Cadence

- [[3-tier-degraded-hamr]] — 3-Tier Degraded HAMR

- [[anthropic-prompt-cache]] — Anthropic Prompt Cache

- [[baton-signing]] — Baton Signing

- [[bundle-rebuild-cadence]] — Bundle Rebuild Cadence

- [[cache-adapters]] — Provider Cache Adapters & Sticky Routing

- [[capability-detection]] — Capability Detection

- [[capability-probe]] — Capability Probe

- [[cf-worker-latency]] — CF Worker Latency

- [[constitution-compressor]] — HAMR Constitution Compressor

- [[deterministic-top-k-extractive]] — Deterministic Top-K Extractive

- [[dpop-binding]] — DPoP Binding

- [[ephemeral-vs-extended-cache]] — Ephemeral vs Extended Cache

- [[fleet-config]] — Fleet Config

- [[fleet-model-upgrades-implementation-2026-05-01]] — Fleet Model Upgrades 2026-05-01

- [[fleet-portable-config]] — Fleet Portable Config

- [[governance-artifact-signing]] — Governance Artifact Signing

- [[hamr-bundle]] — HAMR Bundle

- [[hamr-core-worker]] — HAMR Core CF Worker

- [[hamr-doctor]] — HAMR Doctor

- [[hamr-failover-map]] — HAMR Failover Map

- [[hamr-key-store-tiers]] — HAMR Key Store Tiers

- [[hamr-mvp-revised-child-list]] — HAMR MVP Revised Child List

- [[hamr-substrate-overhead]] — HAMR Substrate Overhead

- [[header-spillover]] — Header-Spillover & Anthropic Batch Routing

- [[ide-proxy]] — Claude Code IDE Proxy

- [[judge-quorum]] — Judge Quorum

- [[keyword-grounded-grading-bias]] — Keyword-Grounded Grading Bias

- [[known-defects]] — Known defects

- [[litellm-client]] — LiteLLM Client

- [[mailbox]] — HAMR R2 Mailbox

- [[model-routing-engine]] — Model Routing Engine

- [[multi-agent-command-center-round-1]] — Multi-Agent Command Center Round 1

- [[per-call-token-economics]] — Per-Call Token Economics

- [[provenance-vs-locality]] — Provenance vs Locality

- [[release-pipeline]] — HAMR Release Pipeline

- [[reuse-refactor-replace-merge-rubric]] — Reuse Refactor Replace Merge Rubric

- [[rule-coverage-gate]] — Rule Coverage Gate

- [[slsa-bundle-verification]] — SLSA Bundle Verification

- [[substrate-health]] — HAMR Substrate-Health Probe

- [[tailscale-fleet-rtt]] — Tailscale Fleet RTT

- [[ticket-audit-pattern]] — Manager-side ticket audit pattern

- [[token-provider-adapters]] — Token Provider Adapters

- [[two-stage-coverage-gate]] — Two-Stage Coverage Gate

- [[two-stage-rule-coverage-gate]] — Two-Stage Rule Coverage Gate

- [[warm-connection-assumption]] — Warm Connection Assumption

## Source Summaries

- [[codex-compatibility-audit-2026-05-13]] — Codex compatibility audit for harness goals/features/functionality
- [[provider-adapter-matrix-2026-05-14]] — Provider adapter matrix for Codex, Copilot, Claude Code, HAMR, and provider paths
- [[provider-neutral-governance-2026-05-16]] — Provider-neutral governance contract for Codex, Copilot, and Claude Code
- [[epic-1271-codex-fdpr-2026-05-10]] — Codex final development plan recommendation for Epic #1271
- [[epic-1271-cx-rd-plan-2026-05-09]] — Epic #1271 Codex R&D plan for state truthfulness
- [[epic-1271-cp-rd-plan-2026-05-09]] — Epic #1271 Copilot R&D plan for state truthfulness
- [[karpathy-llm-wiki-pattern]] — Karpathy LLM Wiki Pattern
- [[devenv-fleet-topology]] — DevEnv Fleet Topology
- [[copilot-skills-system]] — Copilot Skills System
- [[agent-drift-copilot]] — Agent Drift: Copilot-Specific Findings
- [[agent-drift-frameworks]] — Agent Drift: Industry Governance Frameworks
- [[agent-drift-governance]] — Why AI Agents Drift from Global Skills
- [[agent-drift-mitigations]] — Agent Drift: Mitigation Patterns
- [[agent-drift-recommendations]] — Agent Drift: Recommendations
- [[agent-drift-root-causes]] — Agent Drift: Root Causes
- [[agent-drift-sources]] — Agent Drift: Key Sources
- [[agile-roles-analysis]] — Agile Role Responsibilities Analysis
- [[agile-roles-cross-verification]] — Cross-Verification Matrix
- [[copilot-governance-actions]] — Copilot Governance Tied to Actions
- [[dashboard-world-class-research]] — Dashboard Excellence Research
- [[fleet-capability-tagging-patterns-2026-04-28]] — Fleet Capability Tagging Patterns
- [[free-tier-inventory]] — Free-Tier AI Service Inventory
- [[hardware-evaluation]] — Hardware Evaluation
- [[help-best-practices]] — Help Article Best Practices
- [[help-section-structure]] — Help Center Section Structure
- [[prompt-reduction-playbook]] — Prompt Reduction Playbook
- [[tiered-agent-architecture]] — Tiered Agent Architecture
- [[tiered-research-findings]] — Tiered Architecture Research Findings
- [[workflow-design]] — Development Workflow Design
- [[workflow-diagrams]] — Workflow Diagrams
- [[copilot-hooks-api]] — Copilot Chat Hooks API Research
- [[sandbox-worktree-governance-2026-04-29]] — Sandbox Worktree Governance Pack (2026-04-29)
- [[fleet-live-usage-indicator-options-2026]] — Fleet Live Usage Indicator Options (2026)
- [[global-governance-self-anneal-2026]] — Global Governance Self-Anneal (2026)
- [[cost-efficiency-self-anneal-2026]] — Cost→Quality Self-Anneal (2026)
- [[governance-workflow-hardening-2026]] — Governance Workflow Hardening (2026)
- [[governance-verification-harness-2026]] — Governance Verification Harness (2026)
- [[governance-agile-github-remediation-2026]] — Governance + Agile + GitHub Remediation (2026)
- [[readability-commenting-toolchain-2026-04-29]] — Readability & Commenting Toolchain Research (2026-04-29)
- [[llm-wiki-implementation-plan]] — LLM Wiki Optimal Implementation Plan (Apr 2026)
- [[dashboard-comparable-tools]] — Dashboard Comparable Tools Research
- [[js-code-quality-practices]] — JS Code Quality Practices
- [[nodejs-install-patterns]] — Node.js Install Patterns
- [[nodejs-project-organization]] — Node.js Project Organization
- [[openclaw-windows-optimization-2026]] — OpenClaw on Windows: Optimization & Alternatives (2026)
- [[drift-monitoring-strategy-2026-05-01]] — Drift Monitoring Strategy 2026-05-01
- [[token-telemetry-capability-matrix-2026-05-01]] — Token Telemetry Capability Matrix (2026-05-01)
- [[vscode-copilot-allow-prompts-2026-05-05]] — VS Code Copilot Allow Prompts (2026-05-05)
- [[dashboard-live-data-methodology-2026-05-05]] — Dashboard Live-Data Methodology (2026-05-05)
- [[epic-state-truthfulness-rd-2026-05-09]] — Epic-state truthfulness R&D (CC team plan, 2026-05-09)

- [[anthropic-batch-routing]] — Anthropic Batch Routing

- [[codebase-organization-2026-05-02]] — Codebase Organization 2026-Q2

- [[dashboard-closed-state-hygiene-2026-05-04]] — Dashboard closed-state hygiene 2026-05-04

- [[dashboard-layout-density-2026-05-04]] — Dashboard layout density 2026-05-04

- [[fleet-cloud-optimization-2026-05-06]] — Fleet & Cloud Resource Optimization — R&D

- [[fleet-hardware-optimization-2026-05-01]] — Fleet Hardware Optimization 2026-05-01

- [[fleet-harness-awareness-2026-05-04]] — Fleet harness-awareness 2026-05-04

- [[fleet-harness-awareness-v2-2026-05-04]] — Fleet harness-awareness v2 2026-05-04

- [[fleet-resource-audit-2026-05-01]] — Fleet Resource Audit 2026-05-01

- [[hamr-spike-s1-code-audit-2026-05-04]] — HAMR Spike S1 — Existing Code Audit 2026-05-04

- [[hamr-spike-s3-latency-analysis-2026-05-04]] — HAMR Spike S3 — Substrate Latency Analysis 2026-05-04

- [[hamr-spike-s4-prompt-cache-2026-05-04]] — HAMR Spike S4 — Anthropic prompt-cache economics 2026-05-04

- [[hamr-spike-s5-distillation-2026-05-04]] — HAMR Spike S5 — Distillation Rule-Coverage 2026-05-04

- [[hamr-spike-s6-build-vs-adopt-2026-05-04]] — HAMR Spike S6 — Build-vs-Adopt Matrix 2026-05-04

- [[hamr-spike-s6-threat-model-2026-05-04]] — HAMR Spike S6 — STRIDE Threat Model 2026-05-04

- [[hamr-v3-2-1-2026-05-05]] — HAMR v3.2.1 patch 2026-05-05

- [[hamr-v3-2-2-2026-05-05]] — HAMR v3.2.2 R9.2 hook patch 2026-05-05

- [[hamr-v3-2-2026-05-04]] — HAMR v3.2 — post-spike redesign baseline 2026-05-04

- [[hamr-v3-2026-05-04]] — HAMR v3 — 5-axis optimization 2026-05-04

- [[hamr-wave1-s3-live-deploy-2026-05-05]] — HAMR Wave 1 S3 Live Deploy 2026-05-05

- [[hamr-wave1-s4-live-cache-2026-05-05]] — HAMR Wave 1 S4 Live Cache 2026-05-05

- [[hamr-wave1-s5-stage2-2026-05-05]] — HAMR Wave 1 S5 Stage-2 Reasoning Quiz 2026-05-05

- [[harness-convergence-design-2026-05-05]] — Megingjord Harness Convergence Design v1

- [[ide-proxy-shim-2026-05-06]] — Claude Code IDE Proxy Shim — R&D

- [[matrix-refresh-automation-2026-05-03]] — Matrix refresh automation 2026-05-03

- [[multi-agent-command-center-round-2-2026-05-01]] — Multi-Agent Command Center Round 2 2026-05-01

- [[openai-codex-telemetry]] — openai-codex-telemetry

- [[paid-token-floor-reduction-2026-05-01]] — Paid Token Floor Reduction Research 2026-05-01

- [[parallel-fleet-queue-design-2026-05-03]] — Parallel fleet queue design 2026-05-03

- [[ticket-audit-2026-05-02]] — Ticket audit pass 2026-05-02

## Syntheses

- [[devenv-ops-enforcement-architecture]] — DevEnv Ops Enforcement Architecture
- [[dashboard-codebase-gold-rules]] — Dashboard Codebase Gold Rules
- [[sandbox-worktree-governance-pack]] — Sandbox Worktree Governance Pack
- [[global-readability-governance-harness]] — Global Readability Governance Harness
- [[llm-wiki-state-2026]] — LLM Wiki Critical Analysis & 2026 Best Practices
- [[token-telemetry-unified-design-2026]] — Unified Token Telemetry Design (2026)

## Recent Additions

- [[codex-compatibility-audit-2026-05-13]] — Codex compatibility audit (2026-05-13)
- [[provider-adapter-matrix-2026-05-14]] — Provider adapter matrix (2026-05-14)
- [[provider-neutral-governance-2026-05-16]] — Provider-neutral governance contract (2026-05-16)
- [[distributed-self-anneal]] — Three-tier distributed self-anneal (2026-05-10)
- [[andon-pull-protocol]] — Any-role pull protocol (2026-05-10)
- [[epic-1271-codex-fdpr-2026-05-10]] — Codex FDPR for Epic #1271 (2026-05-10)
- [[epic-1271-cp-rd-plan-2026-05-09]] — Epic #1271 Copilot R&D plan for state truthfulness (2026-05-09)
- [[harness-goals]] — Harness Goal Constitution (2026-05-06)
- [[dashboard-live-data-methodology-2026-05-05]] — Dashboard Live-Data Methodology (2026-05-05)
- [[workspace-write-boundary-discipline]] — Workspace Write-Boundary Discipline (2026-05-05)
- [[vscode-copilot-allow-prompts-2026-05-05]] — VS Code Copilot Allow Prompts (2026-05-05)
- [[token-telemetry-unified-design-2026]] — Unified Token Telemetry Design (2026-05-01)
- [[token-telemetry-capability-matrix-2026-05-01]] — Token Telemetry Capability Matrix (2026-05-01)
- [[sandbox-worktree-governance-pack]] — Sandbox Worktree Governance Pack (2026-04-29)
- [[readability-commenting-toolchain-2026-04-29]] — Readability & Commenting Toolchain Research (2026-04-29)
- [[multi-agent-dashboard-design-2026-05-01]] — Multi-Agent Dashboard Design Decisions (Epic #742, 2026-05-01)
- [[sandbox-worktree-governance-2026-04-29]] — Sandbox Worktree Governance Pack Source (2026-04-29)

---

**Pages**: 163 | **Last updated**: 2026-05-16
