---
title: "#3199 Design detail — Work-Log Sync Megalint Validator"
type: work-log
content_trust_score: 0.95
created: "2026-06-22"
updated: "2026-06-22"
tags: [issue, wiki-b, detail-design]
related: [3199]
status: READY
source_path: "github:issue/3199"
source_sha256: "c3a4f1fb7a149c9520a7b45df894f09f0862bf7d7593c2005a76e932b771e809"
content_hash: "4bfdc98fbea311adedb0241588c85a7d8abb6109b6aef599a59beb5ae73729ac"
last_updated: "2026-06-22"
generated_by_run: local
---
# #3199 Design — Work-Log Sync Megalint Validator (v2, red-team amended)

## Architecture: megalint validator, not standalone gate

Implement as `scripts/global/megalint/work-log-sync.js` — a new megalint
validator registered in the existing megalint index. This avoids adding a
14th lefthook command and leverages the existing megalint reporting surface.

## Shared fetcher (zero additional API calls)

Reuse `closeout-preflight.js`'s `readIssue()` and `normalizeComments()`
rather than making a second GitHub API call. The megalint validator receives
the already-fetched issue data as input context, keeping the pre-push
pipeline at its current ~35s ceiling.

## Deferred-final lifecycle awareness

The harness's deferred-final flow (`global-standards.instructions.md` §31)
intentionally allows `CONSULTANT_CLOSEOUT` to be posted after the PR exists.
The sync check must validate phased, not all-at-once:

| Push stage | Local handoffs validated against remote |
|---|---|
| First push (no PR exists) | MANAGER_HANDOFF, COLLABORATOR_HANDOFF |
| After PR creation | + ADMIN_HANDOFF |
| After merge | + CONSULTANT_CLOSEOUT |

Detection: if local work-log contains a handoff block that the current
lifecycle stage does not yet require, emit an advisory, not a block.

## Degradation matrix (G5/G6)

| Condition | Behavior | Exit |
|---|---|---|
| `gh` authenticated, API reachable | Full sync validation | 0 or 1 |
| `gh` unauthenticated (Codex sandbox) | Skip with advisory | 0 |
| `gh` absent (PATH miss) | Skip with advisory | 0 |
| Network timeout (>3s) | Skip with advisory | 0 |
| `MEGINGJORD_STRICT_SYNC=1` | Degrade → block instead of skip | 1 |

## Prevention complement (commit-time guard)

Add a pre-commit check in `scripts/global/pre-commit-docs-check.js`:
when a staged diff includes `wiki/work-log/tickets/<N>.md` containing a
new handoff block (e.g. `## COLLABORATOR_HANDOFF`), verify the corresponding
GitHub comment exists before allowing the commit. This is prevention (catch
at cause) vs. detection (catch at push).

## Multi-client compatibility

| Runtime | `gh` auth | Hook execution | Sync check behavior |
|---|---|---|---|
| Copilot (VS Code) | ✅ | ✅ lefthook | Full validation |
| Claude Code (VS Code) | ✅ | ✅ lefthook | Full validation |
| Antigravity (VS Code) | ✅ | ✅ lefthook | Full validation |
| Codex (CLI/headless) | ⚠️ May lack auth | ⚠️ Hooks run | Graceful skip |
| Cursor | ⚠️ Undocumented | ⚠️ Varies | Graceful skip |

## File inventory

- `scripts/global/megalint/work-log-sync.js` — validator (~80 lines)
- `scripts/global/megalint/work-log-sync-helpers.js` — parsing helpers (~60 lines)
- `tests/work-log-sync-check.spec.js` — unit tests (~90 lines)
- Update: `scripts/global/megalint/index.js` — register new validator
- Update: `scripts/global/closeout-preflight.js` — export shared fetcher
