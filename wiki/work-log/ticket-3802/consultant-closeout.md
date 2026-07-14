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
- **False-positive posture.** The audit reports 12 UNWIRED on the current tree; these are genuine (e.g.
  the baton closure is unreachable because its entry spec `baton-e2e.spec.js` is not tracked on main).
  Reported as an advisory burndown, not a block — correct posture. Wiring/retiring those 12 is
  downstream burndown work (explicit non-goal here), each its own ticket.

## Recommendations (follow-on, not blockers)

1. Burn down the 12 unwired validators — wire each into a workflow/hook/registry or retire it; then
   flip this audit's UNWIRED count toward 0 and consider promoting to a hard block after soak.
2. Investigate the untracked `baton-e2e.spec.js` referenced by `validate-pr.yml` (CI references a file
   absent on main) — separate drift, out of scope for #3802.

## Verdict

**RELEASE.** Merge to main. Reversible, advisory-first, independently ratified (receipt
`4b5bc0f447a50076`).
