---
applyTo: "**"
---

# Wiki Knowledge — Global Instruction

## LLM Wiki Availability

Compiled wiki at `~/.copilot/wiki/` — cross-referenced fleet, skills, governance, architecture, research.

## Access Model

| Operation | Where | Command |
|---|---|---|
| **Search (compiled)** | Any repo | `node ~/.copilot/scripts/wiki-search.js "query"` |
| **Read** | Any repo | Read `~/.copilot/wiki/index.md` then drill into pages |
| **Search (source)** | Megingjord only | `npm run wiki:search -- "query"` |
| **Ingest** | Megingjord only | `npm run wiki:ingest -- raw/articles/<file>.md` |
| **Lint/Anneal** | Megingjord only | `npm run wiki:lint` / `npm run wiki:anneal` |

Ingest pipeline (raw/articles → wiki/wisdom/global/sources → pages → index.md): `WIKI.md` + `docs/howto/contribute-to-wiki.md`.

## When to Use the Wiki

Check wiki before research tasks, governance/architecture questions, cross-referencing skills or ADRs.

## Three-Wiki Typology v2 (Epic #1942, Phase-0 #1943)

Canonical synthesis: `research/three-wiki-typology-synthesis-1943.md`.

**Wiki A — Code-Base** (`wiki/code/`, per-project): mirrors source code semantics (G3 cost).
- `wiki/code/symbols/` structural: file + symbol + signature maps (repo-map schema)
- `wiki/code/concepts/` semantic: feature explainers, dependency graphs, known-issue notes

**Wiki B — Work-Log** (`wiki/work-log/`, per-project): mirrors GitHub tickets + PRs (G3/G7).
- `wiki/work-log/tickets/<N>.md` — `gh issue view N` mirror
- `wiki/work-log/prs/<N>.md` — `gh pr view N` mirror

**Wiki C — Research Wisdom** (`wiki/wisdom/`, dual-scope, G2/G3):
- `wiki/wisdom/global/` — cross-project; distributed to `~/.copilot/wiki/`
- `wiki/wisdom/project/` — project-specific; **NEVER distributed cross-project** (A4 isolation)

Storage layout: `wiki/{code/symbols, code/concepts, work-log/tickets, work-log/prs, wisdom/global, wisdom/project, index.md}`

### wiki/wisdom/global/ subdirectories (migration complete #2098)

`wiki/wisdom/global/entities/` · `wiki/wisdom/global/concepts/` · `wiki/wisdom/global/sources/`
`wiki/wisdom/global/syntheses/` · `wiki/wisdom/global/skills/`
Physical migration completed by #2098 (`git mv` with full history preservation).

## Frontmatter Contract (validator = source of truth — `config/wiki-frontmatter.schema.json`, #2052/#3763)

All wiki pages **require** (the enforced Ajv contract): `title`, `type`
(`code|work-log|wisdom-global|wisdom-project`), `content_trust_score` (0–1), `created` (ISO-8601),
`updated` (ISO-8601). Extra shipped fields are **validated-optional** (`additionalProperties: true`; kept,
not promoted to required): `content_hash`, `last_updated`, `source_path`, `source_sha256`, `sub_layer`
(code pages), `scope` (wisdom pages), `tags`, `related`, `status`, `trust_attestation`.
The retired `wiki_type` / `freshness_window` fields (carried by only 4/2843 pages) are **not** part of the
contract; `freshness_window` retirement is owned by #3731 (temporal `valid_from`/`valid_to`) — do not
re-add it here (no field fight). The validator is a **required PR gate on changed wiki pages** via
`.github/workflows/wiki-frontmatter-gate.yml` (#3763); navigational files (README/index/log/WIKI-*) are
exempt, and the pre-#3763 historical corpus is grandfathered pending backfill (#3767).

## Retrieval Routing

| Query type | Target |
|---|---|
| Symbol / signature lookup | Wiki A `wiki/code/symbols/` |
| Feature / concept explanation | Wiki A `wiki/code/concepts/` |
| Ticket / PR history | Wiki B `wiki/work-log/` |
| Governance / research wisdom | Wiki C `wiki/wisdom/` |

Fallback on hash-mismatch: wiki page → `gh`/`Read` live lookup → wiki page + `STALE:` prefix.

## Auto-Update Pipeline (per #2055)

GitHub Action on PR merge: diff-classify → content-trust → signed-commit → Unicode-scan →
trust-scoring → per-type ingest → hash-record → namespace-isolation → drift-gate →
replay-eval (≥30% token-cost-reduction) → commit.
Phase-1 adapters: `semantic-store`, `structural-index`, `memory`, `trace-eval`.
Phase-2 deferred: `graph` adapter (Wiki C GraphRAG, Epic #1942 Phase-2).

## Bi-Directional Drift Gate (per #2058)

`wiki-drift-required` CI on every PR. Advisory Phase-1; required Phase-2 post replay-eval
calibration (Epic #1771/#1827 — replay-eval over calendar pattern).
Detects: code-changed-wiki-stale, instruction-wiki-divergence, readme-wiki-divergence.

## Wiki-Health Detector (per #3068, Epic #3063 — anti-recurrence)

`scripts/wiki/wiki-health-detector.js` (`npm run wiki:health`) makes "wiki empty or stale"
impossible to miss (the 2026-06-16 both-stores-empty meta-failure). It computes a per-store
(A=code, B=work-log) health vector — `coverage_ratio` / `stale_ratio` / `consistency_errors`
/ `reconcile_error_rate` / `actions_minutes` — emitting a schema-v3 G8 signal to
`dashboard/events.jsonl`. Thresholds: `coverage < 0.95` OR `stale > 0.10` OR any
`consistency_error` ⇒ advisory; `coverage 0` while `source_count > 0` ⇒ Tier-2 incident
(`pattern_id: wiki-store-empty-or-stale`). The Drift Gate's advisory→required promotion is
gated by replay-eval precision ≥ 0.85 against the historical-PR corpus (auto-revoking, NOT
calendar) — the gate stays advisory until calibrated.

## Secret Redaction on the Write-Path (ENFORCED — #3772)

Credential-class secrets **cannot** be committed to the wiki. Two enforced layers (the contract the
mirror headers long *claimed* but did not apply):
- **Prevent-at-write:** `scripts/wiki/wiki-io.js#writePage`/`updateIndex` run `redactSecrets()`
  (`scripts/wiki/wiki-secret-scan.js`) — any anthropic/openai/github-pat/github-fine-grained-pat/aws/jwt/
  bearer token is scrubbed to a `<REDACTED>` placeholder before `writeFileSync`, with a G8 signal (pattern
  ids + path, no values).
- **Required CI backstop:** `.github/workflows/wiki-secret-scan.yml` scans changed `wiki/**/*.md` on every
  PR (no-op green on non-wiki PRs) and **fails** on any credential-class secret — catching edits that bypass
  `writePage`.
- **Scope:** credential-class only. `email`/`ipv4` (PII) stay **advisory** so legitimate technical wiki
  content (example IPs, contact addresses) is not corrupted. Project-specific confidential content is separately
  protected by A4 isolation (`wiki/wisdom/project/` never distributed) and the path-guard (#3064, writes
  confined to `wiki/**`).

## Rules

- Wiki at `~/.copilot/wiki/` is **read-only** from non-Megingjord repos
- Never edit `~/.copilot/wiki/` directly — changes flow through Megingjord
- `wiki/wisdom/project/` MUST NOT be distributed cross-project (A4 namespace isolation)
- Cite wiki pages with `[[page-name]]` wikilink syntax
- If wiki content is stale, note it for Megingjord maintenance
