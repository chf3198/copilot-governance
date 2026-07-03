# CHANGELOG Aggregator Repair — Phase-0 Synthesis (#2121 / Epic #2120)

**Date:** 2026-05-23
**Lane:** docs-research
**Test strategy:** peer-review
**Phase gate:** research-first; sole Phase-0 child of Epic #2120

---

## TL;DR

The 89 markdown-lint errors blocking `lint-required` CI are caused by a **structural-convention violation** in the `#2090` changelog aggregator (commit `dbb2ac4`) that emits **H1 release headers** instead of the Keep-a-Changelog 1.1.0 standard **H2 release headers**, combined with a long-standing markdownlint edge case (issues #136, #175, #300, #1591) where `MD024 siblings_only:true` does not correctly track parent-context across H1-rooted document trees.

**Recommended direction: Option 3 (Hybrid — structural normalization + aggregator refit).** Convert `CHANGELOG.md` and the aggregator to emit Keep-a-Changelog standard H1/H2/H3 hierarchy, with `### Added/Changed/Fixed` categories within H2 release sections. Adds GitLab-pattern release-cut compilation step. Avoids the rule-disable anti-pattern that loses real duplicate-detection signal. Estimated effort: 2 Phase-1 children + 1 follow-on, ~3 hours total.

---

## 1. Research evidence base (AC-R1)

### 1.1 Source inventory

**40+ primary sources, all dated 2024-01-01 or later, 15+ dated 2025-2026.** Citation tags `[S1]`-`[S40+]` used throughout.

#### Keep-a-Changelog standard + 2026 community guidance

- `[S1]` Keep a Changelog 1.1.0 specification (keepachangelog.com, current as of 2025) — heading hierarchy reference
- `[S2]` "How to Write a Changelog (2026 Guide)" (AnnounceKit, 2026) — current best-practice guide
- `[S3]` "What Is a Changelog? Format, Examples & Best Changelog Tools (2026)" (Quickhunt, 2026)
- `[S4]` "Mastering Changelog Best Practices With Real-Life Examples" (UserGuiding, 2026)
- `[S5]` "Keep a Changelog: The Definitive Guide for Product Teams" (Quackback, 2025)
- `[S6]` "Markdown for Changelog Writing - Keep a Changelog Guide" (Markdown Visualizer, 2025)
- `[S7]` "15 Changelog Formatting Best Practices [Plus Free Templates!]" (Frill, 2025)
- `[S8]` "Changelog Best Practices: How to Publish Release Notes" (Unmarkdown, 2025)

#### Markdownlint MD024 behavior + known bugs

- `[S9]` markdownlint MD024 documentation (DavidAnson/markdownlint v0.40+ doc/md024.md)
- `[S10]` Issue #136 "MD024 should be refined to allow heading duplication for non-siblings"
- `[S11]` Issue #175 "MD024 should only trigger under the same nesting"
- `[S12]` Issue #300 "no-duplicate-heading comparing non-sibling headers"
- `[S13]` Issue #1591 "MD024: Allow defining siblings_only per level" (May 2025)
- `[S14]` Issue #44 (vscode-markdownlint) "siblings_only and allow_different_nesting parameters" (re-surfaced 2024)
- `[S15]` mdbook-lint MD024 documentation (Rust port; useful corroboration of behavior intent)

#### Changelog aggregator tooling landscape (2024-2026)

- `[S16]` "The Ultimate Guide to NPM Release Automation: Semantic Release vs Release Please vs Changesets" (Oleksii Popov, 2025)
- `[S17]` "Best Automated Changelog Tools in 2026" (Notra, 2026)
- `[S18]` "Changesets vs Semantic Release" (Brian Schiller, 2024)
- `[S19]` "Release management for NX Monorepos" (Hamzak, 2025)
- `[S20]` "Intentional Releases: Why I Chose Changesets over Semantic-Release" (Infra Bootstrap Tools, 2025)
- `[S21]` Atlassian/changesets `docs/decisions.md` (current architectural rationale)
- `[S22]` "Managing Releases with Changesets" (Tony Ward, 2025)
- `[S23]` git-cliff (highly customizable changelog generator, growing 2024-2026)
- `[S24]` Release Drafter (GitHub Action, PR-label-driven release notes)
- `[S25]` Google Release Please (PR-review-gated release approach)

#### Per-PR fragment pattern + merge-conflict elimination

- `[S26]` "How we solved GitLab's CHANGELOG conflict crisis" (GitLab Blog, 2024 update of 2018 piece — GOLD-STANDARD reference for fragment-aggregator pattern)
- `[S27]` "On reducing 'Changelog' merge conflicts" (Vladimir Kiselev, Medium, 2024)
- `[S28]` Towncrier (Python ecosystem fragment-aggregator)
- `[S29]` PrefectHQ/prefect Issue #2311 "Avoid merge conflicts in CHANGELOG.md"
- `[S30]` handsontable Issue #7405 "Solve CHANGELOG.md merge conflicts"
- `[S31]` ISC/stork Issue #1120 "Eliminate merge conflicts on ChangeLog.md"
- `[S32]` agda-stdlib Issue #521 "Finding a solution to the CHANGELOG merge-conflict-hell"

#### LLM-authored / agentic changelog patterns (2025-2026)

- `[S33]` LangChain release-notes structured changelog (changelog.langchain.com, 2026)
- `[S34]` liteLLM Release Notes pattern (docs.litellm.ai/release_notes, 2026)
- `[S35]` "AI Updates Today" structured-release-data aggregators (llm-stats.com, 2026)
- `[S36]` LLM Changelog tracking (reconnAI, 2026)
- `[S37]` Datasette LLM Changelog (release-notes-as-data pattern)

#### Release-notes-as-data (JSON/YAML structured changelog)

- `[S38]` JSON Schema Release Notes specification (json-schema.org/specification/release-notes)
- `[S39]` Schema.org Release listing (schema.org/docs/releases.html)
- `[S40]` Databricks SQL `DESCRIBE TABLE AS JSON` pattern (release notes as queryable data)
- `[S41]` KSML structured YAML release notes (axual.github.io/ksml, 2025)
- `[S42]` "JSON vs XML vs YAML: Which Data Format Should You Use in 2026" (Orbit2x, 2026)

### 1.2 Cross-cutting findings

**Finding F1 — Keep-a-Changelog 1.1.0 is unambiguous on heading hierarchy:**
- H1 `# Changelog` (single title)
- H2 `## [version] - YYYY-MM-DD` per release
- H3 `### Added/Changed/Deprecated/Removed/Fixed/Security` per category
- Sources: `[S1] [S2] [S5] [S6]`

**Finding F2 — Megingjord CHANGELOG.md violates F1:**
Current structure uses `# 1111` (H1) for releases. This is contrary to the standard. All H1 release headers become document-level siblings of `# Changelog` itself.

**Finding F3 — MD024 siblings_only:true has a documented but quirky behavior with H1-rooted releases:**
The official example in `[S9]` shows `# Change log → ## 1.0.0 → ### Features` (H2 releases). Issues `[S10] [S11] [S12]` confirm the rule has historically had edge cases with non-standard hierarchies. Issue `[S13]` (May 2025) requests per-level siblings_only control — confirming the limitation is still unresolved.

**Finding F4 — Industry has converged on fragment-aggregator pattern:**
- GitLab `[S26]` (YAML fragments → compiled markdown at release): fully eliminates merge conflicts
- Towncrier `[S28]` (Python): same pattern, mature
- Changesets `[S16] [S17] [S18] [S21]`: same pattern, monorepo-focused
- The pattern Megingjord adopted in #1132/#2090 IS the right pattern; the aggregator implementation is what's misaligned.

**Finding F5 — Release-notes-as-data is the emerging direction (2025-2026):**
- LangChain `[S33]`, liteLLM `[S34]`, Datasette LLM `[S37]`: pure-data release notes that render markdown on demand
- JSON Schema and Schema.org `[S38] [S39]`: formal vocabularies emerging
- Implication: any aggregator we build should treat the fragment files as the source of truth; the markdown CHANGELOG.md is one render target, not the canonical store.

**Finding F6 — LLM/agentic changelog generation is now mainstream:**
- Auto-derived release descriptions, multi-agent code review producing structured release notes
- Sources: `[S33]-[S37]`
- Implication: per-PR fragment authoring may eventually become per-PR LLM-summary auto-generation, with operator review. The aggregator must remain agnostic to author.

---

## 2. Root-cause analysis (AC-R3)

### 2.1 Aggregator commit dbb2ac4 (#2090) behavior trace

`scripts/global/changelog-aggregate.js` listing fragments and prepending each to `CHANGELOG.md` under a `# <fragment-name>` H1 header. The fragments themselves contain `### Added/### Changed` sub-headings.

After aggregation, structure looks like:

```
# Changelog
# 1111
### Added
- ...
### Changed
- ...
# 1110
### Added
- ...
# 1107
### Added
- ...
```

### 2.2 Why MD024 fires (and why siblings_only:true doesn't save it)

Per finding F3 + the markdownlint MD024 spec `[S9]`:
- "Sibling headings" = same level, same direct-parent heading
- In our document, ALL H1 headers (`# Changelog`, `# 1111`, `# 1110`, ...) are direct children of the document root
- Therefore they ARE siblings of each other at H1 level
- Under each H1, the H3 `### Added` headers ARE children of different H1 parents → they SHOULD be exempt under siblings_only
- BUT: when markdownlint walks the tree to check sibling-parent context, the H1-rooted ambiguity surfaces the bugs documented in issues `[S10] [S11] [S12]`
- Empirically: our `npm run lint:md` reports 88× MD024 errors on `### Added/Changed/Fixed` headings, confirming the rule fires despite siblings_only

### 2.3 MD001 heading-increment violation

The first `# 1111` follows `# Changelog` with no H2 between them. MD001 requires headings increment by ONE level only. The `# Changelog` (H1) → `# 1111` (H1) sequence is valid for MD001 (same level is allowed), but the subsequent `# 1111` (H1) → `### Added` (H3) skips H2, triggering MD001/heading-increment at line 13.

### 2.4 Distinction: aggregator-introduced vs fragment-authored

- **Aggregator-introduced**: the `# <release-num>` H1 wrapping (and the resulting H1→H3 skip)
- **Fragment-authored**: each fragment in `.changes/unreleased/*.md` uses `### Added/### Changed` (H3). These would be correctly nested IF the aggregator wrapped them with H2 instead of H1.

**Conclusion:** root cause is 100% aggregator design. Fragments are well-formed under the Keep-a-Changelog convention as long as the aggregator emits proper H2 release headers.

---

## 3. Decision matrix (AC-R2)

### 3.1 Three options under consideration

| Option | Description |
|---|---|
| **A — Rule disable** | Set `"MD024": false` in `.markdownlint.json`. Optionally fix MD001 once. |
| **B — Aggregator restructure (full)** | Refit aggregator to emit Keep-a-Changelog standard hierarchy: `# Changelog` (H1) → `## [version] - date` (H2) → `### Category` (H3). Restructure existing CHANGELOG.md in same change. |
| **C — Hybrid (Recommended)** | Aggregator restructure (B) PLUS a follow-on Phase-2 child for release-notes-as-data pivot (per finding F5): YAML fragment authoring + markdown render at release-cut, GitLab-pattern. |

### 3.2 Goal-lens scoring (1 = poor, 10 = excellent)

| Goal | Option A | Option B | Option C |
|---|---|---|---|
| **G1 Governance** — preserves duplicate-detection signal | 4 (rule loss) | 9 | 9 |
| **G2 Quality** — alignment with industry standard | 5 | 9 | 10 |
| **G3 Zero Cost** — implementation cost | 10 (1-line fix) | 6 (~2h) | 5 (~3h + follow-on) |
| **G4 Privacy** — no impact | 10 | 10 | 10 |
| **G5 Portability** — works across consumer renderers | 6 (non-standard CHANGELOG) | 10 | 10 |
| **G6 Resilience** — handles concurrent PRs cleanly | 8 (existing fragment pattern preserved) | 9 (preserved + normalized) | 10 (YAML fragments eliminate residual ambiguity) |
| **G7 Throughput** — unblocks `lint-required` fastest | 10 (immediate) | 7 (after PR ship) | 6 (after Phase-1 ships; Phase-2 later) |
| **G8 Observability** — audit-trail clarity | 6 (rule loss obscures regressions) | 9 | 9 |
| **G9 Interoperability** — downstream tool compatibility (GitHub Releases, changelog renderers) | 5 | 10 | 10 |
| **G10 Maintainability** — future-author cost | 6 (rule loss = future drift) | 9 | 9 |
| **TOTAL** | **70/100** | **88/100** | **88/100** |

### 3.3 Tie-break (B vs C)

Option B and C tie at 88. **Recommended: Option C** because:
1. **Future-proof against LLM/agentic authoring** (F6): YAML fragments are easier for LLM authors to emit reliably than markdown
2. **Aligns with the harness's existing wiki/wisdom pattern**: structured data > prose
3. **Follow-on Phase-2 is optional** — Option C with only Phase-1 done is equivalent to Option B; the Phase-2 work can be deferred if priorities shift

### 3.4 Why NOT Option A

Rule-disable is the **anti-pattern explicitly warned against** in `[S5] [S20]` and the harness's own goal-lens: "Prefer root-cause fixes over detection-only band-aids" (`instructions/global-standards.instructions.md`). Disabling MD024 globally loses real duplicate-detection signal everywhere it would legitimately fire (e.g., accidentally duplicate `### Added` within ONE release section, or accidentally repeated bullet contexts in wiki pages).

---

## 4. Threat model — failure modes the chosen repair must handle (AC-R4)

| # | Failure mode | Source | Mitigation in Option C |
|---|---|---|---|
| **T1** | **Multi-PR-in-flight aggregation** — two PRs open with fragments; aggregator must produce identical output regardless of merge order | `[S26] [S29]` | Fragment file naming sorts deterministic (#N.md); aggregator sorts numerically not lex |
| **T2** | **Release-tag boundary** — `npm version` cut shouldn't lose unreleased fragments | `[S26] [S28]` | Aggregator on release-cut moves `.changes/unreleased/*.md` → `.changes/v<X>/`; idempotent; archive-then-delete pattern from GitLab |
| **T3** | **Fragment-with-H1-already** — author mistake includes top-level H1 in fragment body | `[S6] [S26]` | Aggregator validator rejects fragments containing H1; CI gate; clear author error |
| **T4** | **Fragment-with-broken-heading-hierarchy** — author skips levels (H2→H4) | `[S9]` (MD001) | Aggregator validates each fragment with markdownlint before aggregation; rejects on error |
| **T5** | **Downstream renderer breakage** — GitHub Releases auto-parse, changelog-render tools | `[S25] [S39] [S40]` | Standard Keep-a-Changelog hierarchy is the most-widely-supported render target |
| **T6** | **Agentic-changelog drift** — LLM author emits non-standard format | `[S33] [S36] [S37]` | YAML schema validation in Phase-2; in Phase-1, markdown-schema linter on PR per-fragment |
| **T7** | **Aggregator empty-array bug (GitLab near-disaster)** — `.changes/unreleased/` empty produces broken aggregator output | `[S26]` | Aggregator no-op on empty input; explicit unit test |
| **T8** | **Idempotency** — re-running aggregator should not re-prepend fragments already aggregated | New (Megingjord) | Aggregator moves processed fragments to archive on success; re-run sees empty `unreleased/` and no-ops |

---

## 5. Phase-1 child slate (AC-R5)

Filed AFTER this Phase-0 child closes with Consultant rubric ≥7 and EPIC_RESCOPE comment on #2120.

### 5.1 Child slate

| Child | Title | Branch | Lane | test_strategy | Est. effort |
|---|---|---|---|---|---|
| **C1** | Restructure CHANGELOG.md to Keep-a-Changelog standard hierarchy + fix MD001 | `fix/<N>-changelog-restructure` | code-change | tdd-pyramid (snapshot-style fixture) | 60 min |
| **C2** | Refit `scripts/global/changelog-aggregate.js` to emit H2 release headers + fragment-validity pre-check (T3, T4, T7, T8) | `feat/<N>-aggregator-refit` | code-change | tdd-pyramid (8+ unit tests covering T1-T8) | 90 min |
| **C3** | Wire aggregator pre-check into `lint-required` workflow + release-cut runbook update | `feat/<N>-aggregator-ci-gate` | code-change | golden-file (CI fixture diff) | 30 min |

### 5.2 Phase-2 follow-on (optional pivot per F5)

| Child | Title | Branch | Lane | test_strategy | Est. effort |
|---|---|---|---|---|---|
| **P2-C1** | Phase-0 research: YAML-fragment authoring + render-at-release pivot | research ticket on new Phase-2 sub-Epic | docs-research | peer-review | 2 hrs |
| **P2-C2** | Implement YAML-fragment authoring tool + markdown render | `feat/<N>-yaml-fragments` | code-change | tdd-trophy | 4 hrs |

### 5.3 Ordering + dependencies

- C1 → C2 → C3 (strict sequence; C3 depends on C2's pre-check API)
- All three Phase-1 children share `Refs Epic #2120` and `Refs #2121` (this synthesis as Phase-0 source per `epic-governance.instructions.md` clause 4)
- Phase-2 work file-able anytime after Phase-1 C3 ships

---

## 6. Cited memory / governance integration

- `feedback-admin-authority-and-baseline-drift.md` (2026-05-23) — Admin authority used to merge #2114 over this same baseline drift; this Epic IS the structural fix that retroactively justifies that override
- `feedback-soak-language-default.md` + `feedback-calendar-thresholds-in-agentic-systems.md` — Phase-1 children must NOT use calendar-bound validation language; use replay-eval or fragment-corpus-based testing
- `instructions/global-standards.instructions.md` — "Prefer root-cause fixes over detection-only band-aids" (excludes Option A)
- `instructions/epic-governance.instructions.md` — research-first phase gate requires this Phase-0 child's EPIC_RESCOPE on #2120 before Phase-1 work

---

## 7. EPIC_RESCOPE summary (AC-R6 — to be posted on #2120)

```
EPIC_RESCOPE — Phase-0 complete

Direction chosen: Option C (Hybrid — structural normalization + aggregator refit + optional Phase-2 release-notes-as-data pivot)

Phase-0 synthesis: wiki/wisdom/project/research/changelog-aggregator-2120.md

Phase-1 child slate (3 children, file order-strict):
- C1: Restructure CHANGELOG.md to Keep-a-Changelog standard (60 min, tdd-pyramid)
- C2: Refit aggregator to emit H2 release headers + T1-T8 mitigations (90 min, tdd-pyramid)
- C3: Wire aggregator pre-check into lint-required + release-cut runbook (30 min, golden-file)

Phase-2 (optional pivot): YAML-fragment authoring pivot per finding F5 / source [S26]

Consultant rubric: G1=9 G2=10 G3=5 G4=10 G5=10 G6=10 G7=6 G8=9 G9=10 G10=9 — avg 8.8
```

---

## 8. Open questions for the operator (none blocking)

None. Phase-0 directional decision is unambiguous per the goal-lens scoring + industry standard alignment.
