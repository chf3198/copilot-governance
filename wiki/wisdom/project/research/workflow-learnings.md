# Workflow Learnings — canonical home (Epic #3124 D4)

Canonical home for chronological workflow learnings (migrated from `docs/workflow/learnings.md`
under #3128). `docs/workflow/learnings.md` is now a thin pointer index into this page; the full prose
lives here so a single fact has one home (no duplicated prose). Each entry cites its source ticket.

## 2026-06-02

- #2617: Make overlap boundaries explicit at manager handoff (`related_tickets`, `overlap_decision`) so conflict prevention is enforced by schema, not operator memory.
- #2626: Direct fleet model calls without bounded timeout can stall sessions; use guarded wrappers or explicit timeout flags.

## 2026-06-07

- #2569: Don't ask the client for a credential already in the approved local `.env`. Before any credential prompt, call `credential-availability.js#preCredentialPromptCheck([names])` — `use-local` if available, else `report-absent-no-prompt` (report + terminal-entry, never request the raw secret in chat). Builds on #2645's `loadLocalEnv`.

## 2026-06-08

- #2730: Multi-close batch contract is for INSEPARABLE single-diff work only. If each AC has its own file(s), logic, and tests, it is separable and requires per-ticket workflow (dedicated worktree + branch + baton + own PR per ticket). Using batch as a convenience shortcut is a G1 violation. Pattern: `batch-shortcut-bypasses-per-ticket-workflow`.
- #2735: Six doc-coverage bugs shipped silently because the gate was advisory: `loadNaReasons()` must throw (not return null) on bad config; `execSync` with template strings is OWASP A03 injection — use `spawnSync` + args array; `severity:'warning'` violations don't block `ok:false` — promote to `'error'`; `DOC_COVERAGE_GATE_ADVISORY` env bypass must be removed from all callers, not just the validator itself.
- #2726/#2737: Pretool hook reads `~/.copilot/hooks/state/` (not `~/.megingjord/state/`). After a GraphQL merge (bypassing `gh pr merge`), hook state `admin_ops.merge` stays False. Record it manually via `load_state`/`save_state` from the correct `hooks/scripts/state_store.py` before attempting issue close.
- #2726: Baton CI gate `evidence-completeness` checks issue comment timestamps vs PR creation time. Post ALL baton artifacts before `gh pr create` or it fails with "retroactive planting".
- #2697: Fleet calls that lack a bounded timeout can stall the full session indefinitely. Always wrap fleet dispatches with an explicit `timeout` option or the fleet-call-guard bounded wrapper.
- #3016 (Epic #2707): A blocking-capable validator is still a no-op if gated on an argument the caller never passes. Gate on data the real caller actually provides (derive from `labels`), add a test using the exact CI call signature, and fail-closed on dependency-load errors.
- #3098/#1948: "Phantom completion" — children closed with prose "evidence" but implementation never merged. Completion-truth needs a comment-time validator that cited files exist at `origin/main` and cited PRs are merged (#1889). For a re-ship, derive the objective floor from the diff, not the agent-declared `test_strategy`.

## 2026-06-19

- #3121/#2716/#2707: A second phantom-completion class — code that merged but was never wired. #2716 shipped `doc-coverage-diff-verify.js` with zero callers; unit tests passed and the ticket closed, yet the feature did nothing. A feature is not done until its code is reachable from the real entrypoint — a wiring test that asserts the caller invokes the new code matters as much as unit tests. When you find dead-but-correct code, wire it, don't duplicate it.
- #3124/#3127: Always-resident context (~59K tokens) is both a G3 and G2 leak (context-rot). Drain MEMORY.md to <=200-char pointers; measure the resident set with `npm run resident:budget`. Operator memory is private (~/.claude), never committed.
