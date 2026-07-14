---
title: "#3799-AC1 Manager scope — hermetic signer-alias registry resolution"
type: baton-artifact
role: manager
ticket: 3799
ac: AC1
created: "2026-07-14"
status: OPEN
---

# #3799-AC1 — Manager scope (hermetic baton tooling)

> Baton: **Manager** → Collaborator → Admin → Consultant. Single branch
> `feat/3799-ac1-hermetic-signer`, single worktree `~/wt-3799`, one PR.
> Partial-ticket delivery: this branch closes **AC1 only**. AC2/AC3/AC4/AC5 remain
> OPEN (tier-blocked). Ticket status stays OPEN; only the AC1 checkbox flips.

## Problem (root cause #1 & #2 of #3799)

`scripts/signer-alias.js` `loadRegistry()` resolves the team-model-signature registry from
`path.join(__dirname, '..', '..', 'inventory', 'team-model-signatures.json')` — an **out-of-repo**
path (`<repo>/../inventory/...`) that is **absent on a clean, `.git`-less archive checkout**. Any
baton tooling that resolves a signer alias therefore cannot run from a bare checkout → cannot pass
hermetic CI → normalizes "complete at mirror-level, defer merge" (the exact friction #3799 anneals).
`scripts/baton-e2e.spec.js` works around this by self-provisioning a fixture at the out-of-repo
path — a patch, not a fix.

## Scope (AC1 only)

Make signer-alias registry resolution **hermetic** so baton tooling runs from a clean checkout,
and **track the registry closure in-repo**.

### Deliverables
1. `scripts/signer-alias.js` — `loadRegistry()` resolution order:
   `BATON_SIGNER_REGISTRY` env override → in-repo `<repo>/inventory/team-model-signatures.json`
   → legacy out-of-repo `<repo>/../inventory/...` (back-compat) → clear throw. Behavior for existing
   local dev machines is preserved (in-repo alias subset mirrors the real registry's alias values).
2. `inventory/team-model-signatures.json` (NEW, tracked in-repo) — **secret-free** alias-resolution
   subset: `defaultAliasSeed`, `roleSurnames`, `substrateTeamMap`, `registry`. **NO `cryptoKeys`**
   (public keys stay out-of-repo; nothing secret enters the repo — G4).
3. `scripts/signer-alias.spec.js` (NEW) — hermetic regression: resolution-order precedence,
   `canonicalSignerAlias`, `enforceSignerAlias` match/mismatch. Node built-in `assert`, self-executing,
   exit 1 on fail.
4. `scripts/baton-e2e.spec.js` — resolve the signer registry from the in-repo path so the E2E is
   hermetic without writing to an out-of-repo location.
5. `inventory/harness-self-test-registry.json` — register `signer-alias` (regression discipline #1893).

## Acceptance gates (verification)
- G-hermetic: `git archive feat/3799-ac1-hermetic-signer | tar -x -C /tmp/ci-3799` then
  `(cd /tmp/ci-3799 && node scripts/signer-alias.spec.js && node scripts/baton-e2e.spec.js)` → exit 0
  on a clean, `.git`-less, no-`../inventory` tree.
- G-consensus (AC5 slice for the hermetic-path design): `cross-family-consensus.js --ticket 3799
  --kind review`, ≥2 distinct families, PASS; receipt cited in the Consultant artifact.
- G-discipline: `node scripts/validator-discipline.js --files=...` clean (signer-alias allowlisted;
  spec+registry shipped regardless).

## Non-goals
- AC2 (reversible/carve-out classifier), AC3 (mirror Admin semantics), AC4 (completion-gate hardening)
  — separate tier-blocked units. Do not weaken carve-outs or C-G1/C-G4.

## Constraints
- Touch ONLY AC1 files. main is an unprotected mirror → feature-branch push + PR + merge is
  reversible → complete autonomously (G8 autonomy default). Mirror ticket: PR body cites
  `wiki/work-log/tickets/3799.md`; no `Closes #N`.
