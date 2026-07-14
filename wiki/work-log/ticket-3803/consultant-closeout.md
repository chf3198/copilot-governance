# CONSULTANT_CLOSEOUT — #3803 governance-verify enforceable + wired

> **Baton role**: CONSULTANT | **ticket**: #3803 | **branch**: fix/3803-governance-verify-enforceable
> **cross_family_verdict**: PASS | **receipt**: `daa2a1f27e79e6e4` | families: meta (groq), mistral

## Independent critique

**Scope fidelity — PASS.** Closes exactly the single UNWIRED finding surfaced by #3802, end-to-end: the
false failure is removed, the validator is tested, and it is wired so the enforcement-wiring-audit now
reports 0 UNWIRED. The #3802 detector → #3803 remediation loop is demonstrated working.

**Correctness — PASS.** The presence-tolerant merge-queue check is a genuine correctness fix: the two
hard-coded filenames (`lint.yml`, `branch-name.yml`) never existed in this flat repo, so the old check
could only ever emit false positives. The `merge_group` assertion is preserved for any such workflow that
is actually present (regression-tested). The `verify(root)` refactor is behavior-preserving for the CLI
(guarded by `require.main`) and makes the validator unit-testable for the first time.

**Enforcement-first — PASS.** Ships a wired CI job with two hard gates (self-test + repo verify) plus a
regression spec and self-test registry entry, so the validator cannot silently rot again.

## Risk assessment

- **Low–moderate** (touches a core validator). Mitigations: (1) all pre-existing issue strings and ticket
  checks preserved verbatim; only the merge-queue existence semantics changed; (2) advisory blocks
  (ownership/epic-child) untouched and still scan the flat mirror; (3) 7-assertion regression spec incl.
  the exact flat-main scenario; (4) hermetic clean-tree run green; (5) no current consumer relied on the
  old `../..` root (governance-verify was unwired), so the root fix is safe.
- **Reversible** (unprotected main, mirror repo).

## Residual / follow-on (not blockers)

- The ticket-lint loop remains a safe no-op on flat `main` (no top-level `tickets/` dir, and the mirror
  tickets use a different frontmatter schema). Reconciling the `# Ticket N —` parser to the flat
  wiki-mirror schema is a separate research-first ticket (explicit non-goal here). Until then,
  governance-verify enforces the merge-queue rule + runs the ownership/epic-child advisories on every PR.

## Verdict

**RELEASE.** Merge to main. Correctness fix, independently ratified (receipt `daa2a1f27e79e6e4`).
