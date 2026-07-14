# #3801 — baseline capture · CONSULTANT CLOSEOUT (independent critique)

> Baton role: **Consultant**. Post-execution critique; no implementation scope change.

## Verdict: **ACCEPT** — capture is faithful, safe, and correctly scoped.

## Cross-family ratification

`cross-family-consensus.js --ticket 3801 --kind review` → **consensus PASS**, receipt
**`b190be5c137642bb`**, families **meta** (groq) + **mistral** (2 distinct, non-authoring). Ratifies:
(1) capture-as-baseline over discard; (2) faithful snapshot; (3) `.gitignore` `wiki/`-ignore consequence
acceptable for a baseline PR. (Ollama free fleet not used — memory `free-fleet-cpu-bound`; cloud panel used.)

## Risk assessment

| Risk | Sev | Mitigation / disposition |
|------|-----|--------------------------|
| Capturing a behavioral change disguised as "snapshot" | Med | Content 39/39 `cmp`-clean; modes normalized to canonical index; diff is content-only. No edits. |
| Base conflation (feat/3026 commits vs drift) | Med | Verified drift is **disjoint** from the full feat/3026-vs-main committed diff ⇒ base==main is exact. |
| `.gitignore` `wiki/` ignore alters baton-artifact workflow | Low-Med | Already-tracked wiki files stay tracked; new artifacts force-add; aligns with ratified mirror-cutover (#3719). Panel-ratified. Follow-up may revisit if force-add friction proves costly. |
| Running-guard regression from re-tracking | Low | Faithful snapshot of *already-running* logic; 4 hooks `py_compile`-green on clean tree. No logic change. |
| Silent revert of live guards (the DANGEROUS path) | — | **Avoided** — `reset --hard` explicitly rejected; capture chosen. |

## Residual / follow-ups (not blocking this merge)

- Re-parking the canonical `~/copilot-governance` checkout onto post-merge `main` so its working tree
  goes clean is a **separate** step (owned outside this cleanup; §6 forbids mutating the shared checkout here).
- If `wiki/` force-add friction is material, a follow-up ticket can split the `.gitignore` `wiki/` line
  from the runtime/token ignores.

## Recommendation: **merge** (reversible, unprotected main, no carve-out triggered — G8 autonomous).
