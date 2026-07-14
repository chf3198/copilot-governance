# #3801 — baseline capture · COLLABORATOR VALIDATION (evidence)

> Baton role: **Collaborator**. Gates from Manager scope AC1/AC2/AC3.

## AC1 — faithful snapshot (content byte-identical)

- 39 files copied from canonical checkout working tree → branch. `cmp -s` per file: **39/39 identical**.
- Branch changeset == exactly the 39-file drift list (`comm -23` of changed-vs-list = empty).
- Diffstat: **39 files, +2159 / −607** — byte-matches the canonical checkout's `git diff HEAD`.
- Modes normalized to the canonical git index (docs/config 100644, `.py` hooks 100755) ⇒ committed diff
  is **content-only, 0 mode changes**. (See manifest "Mode normalization".)

## AC2 — attribution manifest

`capture-manifest.md` groups all 39 into 5 subsystems (hooks / instructions / skills / agents / config)
with per-file Δ, mined `#NNNN` refs, and one-line change nature. Best-effort forensic; `—` = inferred.

## AC3 — hermetic verification (clean, `.git`-less tree; node-built-ins/stdlib only)

- Extracted the tracked tree to `/tmp/ci-3801` (126 files, **`.git` absent** — confirmed clean tree).
- `python3 -m py_compile` on all 4 captured hooks
  (`pretool_guard`, `stop_reminder`, `posttool_reminders`, `session_context`): **ALL 4 OK**.
- No network, no `gh`, no untracked deps used. Captured docs/skills/instructions/agents are static
  Markdown (no executable surface); the only executable surface in scope = the 4 hooks (compiled green).

## Notes for Consultant / Admin

- This is a **reversible** capture to **unprotected** `main` (no security-weakening — faithful snapshot
  of already-running guards). Autonomy default applies; no retained carve-out triggered (G8).
- One decision flagged for the panel: the `.gitignore` `wiki/` ignore (see manifest ⚠ section).
