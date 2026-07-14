---
title: "#3799-AC1 Collaborator — hermetic signer-alias implementation + evidence"
type: baton-artifact
role: collaborator
ticket: 3799
ac: AC1
created: "2026-07-14"
---

# #3799-AC1 — Collaborator handoff

**Team & Model**: claude-code:opus@anthropic · **Signed-by**: Orla Harper · **Role**: collaborator

## Changes (only AC1 files)
- `scripts/signer-alias.js` — `loadRegistry()` → `registryPath()` resolution order:
  `BATON_SIGNER_REGISTRY` env → in-repo `inventory/team-model-signatures.json` → legacy out-of-repo
  `<repo>/../inventory/...` → clear throw. Exported `loadRegistry/registryPath/IN_REPO_REGISTRY/LEGACY_REGISTRY`.
- `inventory/team-model-signatures.json` — NEW tracked, secret-free alias subset (defaultAliasSeed,
  roleSurnames, substrateTeamMap, registry). No `cryptoKeys`, no `PRIVATE KEY` material.
- `scripts/signer-alias.spec.js` — NEW hermetic regression (9 tests).
- `scripts/baton-e2e.spec.js` — `REGISTRY_PATH` now in-repo; no out-of-repo fixture write.
- `inventory/harness-self-test-registry.json` — registered `signer-alias`.

## Validation evidence (matches Manager gates)
- **G-hermetic** — `git archive feat/3799-ac1-hermetic-signer | tar -x -C /tmp/ci-3799` (clean, no
  `.git`, no `/tmp/inventory` sibling), then in `/tmp/ci-3799` with `BATON_SIGNER_REGISTRY` unset:
  - `node scripts/signer-alias.spec.js` → **exit 0** (9/9 PASS, incl. secret-free invariant)
  - `node scripts/baton-e2e.spec.js` → **exit 0** (13/13 PASS, signer-independence intact)
  - `node scripts/validator-discipline.spec.js` → **exit 0**
- **G-discipline** — `validator-discipline.js --files=<changeset>` → `OK — no unguarded validators`.
- Local (pre-archive) runs of all three specs also green.

Behavior preserved for existing dev machines (in-repo alias values mirror the canonical registry; the
out-of-repo cryptoKey-bearing registry remains reachable via env / legacy path).

→ Handing to **Admin** for push/PR/CI/merge.
