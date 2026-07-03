---
title: "#3199 Acceptance detail — Work-Log Sync Megalint Validator"
type: work-log
content_trust_score: 0.95
created: "2026-06-22"
updated: "2026-06-22"
tags: [issue, wiki-b, detail-acceptance]
related: [3199]
status: READY
source_path: "github:issue/3199"
source_sha256: "c3a4f1fb7a149c9520a7b45df894f09f0862bf7d7593c2005a76e932b771e809"
content_hash: "ca236eb4ab5dceb610db66f4b81df7b8067de8287cd04086dbb2f085041f988f"
last_updated: "2026-06-22"
generated_by_run: local
---
# #3199 Acceptance Criteria (v3, red-team + research amended)

## AC1 — Megalint validator implementation

`scripts/global/megalint/work-log-sync.js` parses local
`wiki/work-log/tickets/<N>.md` frontmatter and handoff blocks, then validates
each declared handoff against the remote GitHub issue's comments and labels.
Runs inside the existing megalint gate (zero new lefthook entries).

## AC2 — Shared fetcher integration

The validator reuses `closeout-preflight.js`'s `readIssue()` and
`normalizeComments()` exports. No additional GitHub API round-trip is made.
Verified by: megalint integration test confirming shared fetch mock is consumed.

## AC3 — Deferred-final lifecycle awareness

Validation is phased per the deferred-final contract:
- Pre-PR: only MANAGER_HANDOFF and COLLABORATOR_HANDOFF are blocking.
- Post-PR: ADMIN_HANDOFF becomes blocking.
- Post-merge: CONSULTANT_CLOSEOUT becomes blocking.
Out-of-phase handoffs in the local work-log emit advisories, not blocks.

## AC4 — G6 resilience (degradation-first)

When `gh` CLI is unauthenticated, absent, or network-unreachable, the
validator skips with an advisory (exit 0). Override: `MEGINGJORD_STRICT_SYNC=1`
converts skip to block (exit 1). Verified by: unit tests with mock
`gh` failure scenarios (auth fail, timeout, missing binary).

## AC5 — Unit test suite

`tests/work-log-sync-check.spec.js` covers at minimum:
- Synced state (all local handoffs match remote) → PASS
- Missing remote comment for a declared local handoff → FAIL
- Status label mismatch (local ahead of remote) → FAIL
- Deferred-final: CONSULTANT_CLOSEOUT local-only before PR → advisory
- Offline / `gh`-absent fallback → advisory skip
- `MEGINGJORD_STRICT_SYNC=1` with offline → FAIL

## AC6 — Multi-client compatibility evidence

Test evidence or documented verification that the gate produces correct
behavior across: Copilot, Claude Code, Antigravity (full validation),
Codex headless (graceful skip), and Cursor (graceful skip). Documented
in COLLABORATOR_HANDOFF `cross_family_findings` block.

## AC7 — Prevention complement (commit-time guard)

`scripts/global/pre-commit-docs-check.js` is extended: when staged diff
includes `wiki/work-log/tickets/<N>.md` with a new handoff block header,
verify the corresponding GitHub comment exists before allowing commit.
Degrades gracefully when `gh` is unavailable (advisory, not block).

## AC8 — Task-scoped context manifest for `area:governance`

Ship `config/context-manifests/governance.json` mapping the governance
area to its critical instruction files, existing infrastructure scripts,
and anti-patterns. Agent configs reference the manifest loading directive.

## AC9 — Runtime compatibility matrix template + validator

Ship `config/runtime-compatibility-matrix.yml` template. Tickets touching
hooks/gates/CLI tools must fill it out. A megalint advisory validator
checks for its presence in COLLABORATOR_HANDOFF for applicable lanes.

## Verification gate

`npm run lint` passes. `npm test` passes (node:test suite).
All 9 ACs verified PASS in COLLABORATOR_HANDOFF per-AC block.
