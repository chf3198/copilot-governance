# Manager scope — 2275 (Phase-1 P1-1: deterministic post-merge state-store reconciler)

> Baton role: MANAGER. Recorded BEFORE any code edit. Branch: feat/2275-state-store-merge-reconciler.
> Parent Epic: 2261 (deterministic guardrail harness). Lane: code-change. Test strategy: tdd + stress.

## Problem (verbatim intent)
After a PR merges to `main`, the local governance state-store keeps reporting
`admin_ops.merge: missing` and `flags.code_touched: True` because no observer consumes the
verifiable merge event and reconciles state. The Stop-hook then blocks turn-end despite the merge
being a verifiable fact. Today the only "fix" is the agent manually setting the flag — the exact
soft-bypass pattern Epic 2261 exists to eliminate. The right tier is **T2**: a deterministic policy
writes the flag atomically on a *verified* merge event; the agent never writes it.

## Reality reconciliation (why the ACs are adapted — §3g)
- The mirror ticket names `hooks/scripts/state_store_merge_reconciler.py`, `~/.copilot/hooks/state/repo-*.json`,
  and Python session-end/`post-merge` git-hook wiring. Those modules (`governance_state`, `stop_checks`)
  are the **live untracked harness** — NOT on `origin/main`. `origin/main` is the flat governance-validator
  repo (`scripts/*.js` + sibling `*.spec.js`, `inventory/harness-self-test-registry.json`, `.github/workflows/*.yml`).
- Per protocol §3g ("Adapt any AC that names a non-existent path"), the tracked, hermetic, enforcement-first
  deliverable is a JS reconciler with a **pure evidence-gated core** (fs + evidence injected), a sibling
  self-executing spec, a registry entry, and CI + governance-verify advisory wiring. Live-harness Python
  hook integration is out-of-repo → documented as a follow-up shim, not fabricated here.
- Reuse-first: `origin/main` has NO state-store reconciler. Adjacent registered validators
  (`mirror-admin-completion`, `governance-verify`, `enforcement-wiring-audit`) are close idioms to match, not
  duplicates of this concern (they classify tickets/wiring, not local state-store admin_ops flags).

## Scope (adapted ACs)
- **AC1** `scripts/state-store-merge-reconciler.js`: pure `reconcile(stores, evidence, opts)` that, across ALL
  provided state-store variant objects, atomically sets `admin_ops.{commit,push,pr_create,ci_green,merge}=true`
  and `flags.code_touched=false` — and does so only when merge evidence is verified. Atomic = all-or-nothing
  across variants (a single failure reconciles none).
- **AC2** Defense-in-depth invocation: exported `reconcileFiles(paths, evidence, {readFile,writeFile})` with fs
  injected for hermetic testing; a documented CLI entry (`node scripts/state-store-merge-reconciler.js`) usable
  from a session-end/post-merge context. (Live Python hook wiring noted as out-of-repo follow-up.)
- **AC3** Emits a structured audit record `{pattern_id:'admin-ops-merge-reconciled', pr, sha, variants, ts}`
  via an injectable sink (default append to an incidents path); tests assert the emitted record shape.
- **AC4** REFUSES to clear flags unless evidence is verifiable (`evidence.state==='MERGED'` AND matching repo/pr).
  Unverifiable / absent / non-MERGED evidence ⇒ no mutation, structured refusal reason. The policy never trusts
  the agent's word (no "force" path).
- **AC5** Stress spec: (a) `code_touched=true + admin_ops.merge` missing + verified MERGED evidence ⇒ gate cleared
  across all variants; (b) same state WITHOUT evidence ⇒ gate remains blocked, no writes; (c) atomicity — a
  mid-write failure on one variant leaves ALL variants unmutated; (d) idempotent re-run yields no diff.
- **AC6** Enforcement wiring: registry entry in `inventory/harness-self-test-registry.json` + wired default-on
  **advisory** into `scripts/governance-verify.js` (never blocks, never mutates issues) + CI job that runs the
  spec. Must keep `enforcement-wiring-audit` at 0 UNWIRED.
- **AC7** Independent validation: cross-family consensus (≥2 families, PASS) ratifying the evidence-gate design
  (verify-then-write, refuse-without-evidence, atomic-all-or-nothing) before merge; cite receipt.

## Non-goals
- No mutation of real `~/.copilot` state files in tests or CI (hermetic, injected fs only).
- No live GitHub issue interaction (mirror-mode; PR body cites the mirror path).
- No promotion to hard-block this session (advisory-first norm; block only after low-FP soak).

## Verification gates
- Hermetic: `git archive <branch> | tar -x -C /tmp/ci && (cd /tmp/ci && node scripts/state-store-merge-reconciler.spec.js)` GREEN on a clean .git-less tree, node built-ins only.
- `node scripts/enforcement-wiring-audit.js` shows the new validator ENFORCED (0 UNWIRED).
- Cross-family consensus PASS receipt cited.
- Full baton Manager→Collaborator→Admin→Consultant; PR→CI-green→squash-merge to main (reversible, autonomous per G8).

Signed-by: Manager (claude-code)
Role: manager
