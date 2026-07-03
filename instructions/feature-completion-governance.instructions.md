---
applyTo: "**"
---

When asked to "complete" a feature-add, all four baton roles are required. Tests passing only closes Collaborator — do not stop there.

## Gate entry conditions (Refs #1944)

The four baton role transitions advance under explicit, validator-enforced entry conditions. Canonical specification lives in `instructions/role-baton-routing.instructions.md` §"Gate entry conditions — Admin and Consultant". Summary applicable to "complete this feature" requests:

- **Admin gate** (Collaborator → Admin): triggers when COLLABORATOR_HANDOFF is posted with all four signing fields plus per-AC verification PASS; role-label flips `role:collaborator → role:admin`; status-label flips `status:in-progress → status:testing`; preconditions enforced by `collaborator-handoff` + `test-discoverability` validators.
- **Consultant gate** (Admin → Consultant): triggers when ADMIN_HANDOFF is posted with signing + branch/commit/signer-independence fields; role-label flips `role:admin → role:consultant`; status-label flips `status:testing → status:review`; preconditions enforced by `admin-handoff` + `signer-fidelity` + `merge-evidence-pr-gate` validators plus signer-independence Admin-vs-Collaborator alias-difference check.
- **Close gate** (Consultant → done): triggers when CONSULTANT_CLOSEOUT carries verdict + rubric + anneal-tickets-filed + mid-flight-flaws blocks; role-label removed; status-label flips `status:review → status:done`; issue closes atomically; preconditions enforced by `consultant-closeout` validator and the merge-recorded admin_ops state.

Completion intent semantics are strict:
- "complete", "finish", or "ship" means terminal workflow delivery in one session when feasible once the active role identifies that intent in task scope.
- Do not pause after implementation to wait for another user nudge to run Admin or Consultant phases.
- Escalate only for blockers, missing evidence, or explicit design/UAT decisions.
- Do not end a session while recoverable terminal-finalize work remains (for example, merged deferred-final evidence with closeout but issue still open).
- When deferred-final evidence and CONSULTANT_CLOSEOUT coexist, perform or verify explicit issue closure before claiming completion.

## Wait-For-Green Discipline

- If required checks are pending and none are failing, do not run merge/branch-modifying commands.
- In pending-only state, allowed actions are read-only check polling and evidence updates.
- Attempt merge only when required checks are fully green.
- If checks are green but merge is blocked by policy, use one explicit escalation path and capture the block reason in `ADMIN_HANDOFF` (for example under `merge_block_reason:`).

## Admin completion contract (required before claiming done)

- Version collision check (Marketplace/tag/package alignment)
- Commit + push + PR creation with issue linkage
- CI green verification
- Merge
- Publish/release work (if applicable)
- Release integrity verification
- Issue closure comment with released version evidence
- **Runtime-deploy sync verification** (per #1105 D-006 / Codex Team CX-RD C8 HIGH-severity finding) — for changes that affect deployed runtime artifacts (`~/.copilot/`, `~/.codex/`, `~/.agents/skills/`), the closeout MUST include outputs of:
  - `npm run sync:codex` (Codex runtime parity)
  - `npm run sync:claude` (Claude Code runtime parity)
  - `npm run hamr:sync-verify` (HAMR substrate verification)

  If a change does NOT affect deployed runtime artifacts (e.g., wiki-only edits, research files), state explicitly: `sync-verification: N/A — change does not touch deployed runtime targets.`

## Documentation coverage matrix (required)

For behavior/config changes, confirm all applicable docs are updated:
- root README
- extension README
- root + extension CHANGELOG
- design docs (system-stability and related)
- contributor/governance docs (.github/CONTRIBUTING, PR template)
- public profile/community docs when workflow changes impact contributors

If any item is intentionally N/A, state N/A + reason explicitly.

Never claim "feature complete" with uncommitted worktree changes.

## Platform merge-authority bridge (#3336)

The platform-recognized grant of **Admin autonomous-merge** and **Consultant
autonomous-close** authority is the committed `automode-provision` autoMode bridge
(`scripts/global/automode-provision.js`), installed at host provisioning by
`npm run hamr:activate` (#3346). A `permissions.allow` rule does **not** suppress the
Claude Code auto-mode classifier; the `autoMode` prose block is the documented override,
and it is the portable, test-guarded (`tests/automode-provision-bridge-3336.spec.js`)
home of the grant. The grant is **scoped** — it authorizes a merge only when the linked
issue carries a `CONSULTANT_CLOSEOUT` and required CI is green, and the independent
`baton-authority/merge` gate remains the mechanical precondition (it is not a blanket
self-merge license).

**The client is NEVER a merge approver.** Merge authority is the Admin baton role and
close authority is the Consultant baton role — both AI-agent roles. Asking the client to
authorize a routine merge or issue close is a governance misalignment (operator-identity
contract: client = design + UAT only). Per-machine permission-prompt allows belong in the
gitignored `.claude/settings.local.json`, never in committed shared settings.
