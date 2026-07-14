# CONSULTANT_CLOSEOUT — #3802 enforcement-wiring-audit

> **Baton role**: CONSULTANT | **ticket**: #3802 | **branch**: feat/3802-enforcement-wiring-audit
> **cross_family_verdict**: PASS | **receipt**: `4b5bc0f447a50076` | families: meta (groq), mistral

## Independent critique

**Scope fidelity — PASS.** Delivers exactly the E1 §4.iii mandate: detect guardrails that are
"reconciled to done" yet never invoked. The reachability model (enforced roots + `require()` closure)
is a defensible operational definition of "enforced," and it is provably disjoint from #1893
validator-discipline (presence of spec+registry, not invocation).

**Correctness — PASS.** Regression spec covers direct/transitive/registry/hook/workflow roots and the
unwired case, plus a determinism check and a real-tree partition invariant. Hermetic clean-tree archive
run is green (Node built-ins only; no network/`gh`/untracked deps).

**Enforcement-first — PASS (advisory tier, intentional).** Ships a wired CI job whose self-test is a
hard gate and whose burndown report is advisory-first (exit 0), consistent with the harness norm of
promoting to hard-block only after a low-FP soak. The audit is itself now enforced (registry + its own
workflow), so it cannot silently rot into the very category it detects.

## Risk assessment

- **Low.** Additive: one new validator + spec + registry line + one advisory workflow. No existing
  validator, gate, or workflow semantics changed. CLI is non-blocking. Fully reversible (mirror repo,
  unprotected main).
- **False-positive posture.** An initial draft over-reported 12 UNWIRED because its `require`-only edge
  model missed the enforced `baton-e2e.spec.js` fixture's `require('./x.js')` (extension) and
  `spawnSync(['scripts/x.js'])` (child_process) loads. Review caught this; the edge model was corrected
  to be extension-tolerant and to follow path-strings in reached bodies (a completeness fix within the
  same reachability taxonomy, not a design change), and the regression spec now covers both forms.
  Corrected result: **1 UNWIRED — `governance-verify`**, a genuine, high-signal finding (the primary
  governance validator is wired into no CI/hook/registry path). Reported as advisory, not a block —
  correct posture. This tightening is exactly why the audit ships with its regression spec.

## Recommendations (follow-on, not blockers)

1. Burn down the single unwired validator `governance-verify` — add a CI job / self-test-registry entry
   so it actually runs, then consider promoting this audit to a hard block after a low-FP soak.
2. Re-run the audit whenever validators are added: its own CI job keeps the burndown count visible on
   every PR, so new unwired validators surface immediately.

## Verdict

**RELEASE.** Merge to main. Reversible, advisory-first, independently ratified (receipt
`4b5bc0f447a50076`).
