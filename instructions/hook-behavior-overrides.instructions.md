# Hook Behavior Overrides

Governance hooks (stop-hook, user-prompt-submit-hook) are **advisory by default** during in-flight execution. This contract is canonical for all runtimes (Claude Code, Copilot, Codex).

## Advisory hooks

- **Stop hook** on MANAGER_HANDOFF missing issue reference: log to `~/.megingjord/hook-warnings.jsonl`, proceed. Issue reference will be corrected in the final artifact before merge.
- **User Prompt Submit hook** on compliance gap: log + proceed if work is already scoped and in-progress. Use `[override: reason]` marker in the artifact if needed.

## Blocking behavior

Reserved for genuine governance failures:

- Actual credentials/secrets detected.
- Policy violations (e.g., code committed on `main` instead of a feature branch).
- Schema malformations that prevent parsing.

## Pattern detection threshold

If the same hook fires ≥2 times in 7 days on legitimate work, file a Tier-2 self-anneal ticket for the **hook itself** (not the artifact). See `instructions/workflow-resilience.instructions.md` for tier definitions and `instructions/distributed-self-anneal.instructions.md`-equivalent triggers.

## Runtime references

- `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.codex/AGENTS.md` — entry-point files that point at this contract via `governance/README.md`.
- `hooks/scripts/stop_checks.py`, `hooks/scripts/pretool_guard.py` — hook implementations.
- `instructions/workflow-resilience.instructions.md` — Tier-2 self-anneal authority matrix.
