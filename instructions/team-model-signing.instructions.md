---
name: Team & Model Signing Governance
description: Require AI-authored governance artifacts to carry human alias plus structured team/model provenance across tickets, git, PRs, and documentation.
applyTo: "**"
---

# Team & Model Signing Governance

## Canonical rule

- Every governed AI-authored artifact carries:
  - `Signed-by: <human-alias>`
  - `Team&Model: <team>:<model>@<substrate>[/<device>]`
  - `Role: manager|collaborator|admin|consultant`
- Optional cryptographic provenance MAY be appended with:
  - `Crypto-Algorithm: ed25519`
  - `Crypto-Key-Id: <team-role-key-id>`
  - `Crypto-Signature: <base64-signature>`
- Human-readable fields remain required for friendly readers; crypto fields augment non-repudiation and must not replace them.
- Use `Device` only when execution ran on a named fleet target or remote gateway.

## Source of truth

- `inventory/team-model-signatures.json` is the alias registry; `scripts/global/agent-signature.js` consumes it.
- Human aliases are deterministic from team + model + role.
- Repo-local governance may extend or tighten the format, but may not remove team/model provenance.

## Required surfaces

- GitHub issue comments for baton artifacts, blocker notes, and exception evidence.
- PR descriptions and release/closeout evidence.
- AI-authored governance, design, or research docs.
- AI-authored commits should include structured trailers when the toolchain permits.

## Git trailer contract

- `AI-Signature: <human-alias>`
- `AI-Team-Model: <team>:<model>@<substrate>[/<device>]`
- `AI-Role: <role>`
- Commit subject/body rules still follow repo commit policy; issue linkage `#N` remains mandatory.

## Alias derivation

- Given name derives from team + model family.
- Match the first registry entry whose team/model pattern and optional device pattern fit.
- Surname derives from active Agile role.
- Current role surnames: Manager=`Mason`, Collaborator=`Harper`, Admin=`Reyes`, Consultant=`Vale`.
- Use `node scripts/global/agent-signature.js` for raw signatures or `node scripts/global/baton-comment-build.js` for full baton comment templates.

## Enforcement and recovery

- CI enforcement: `.github/workflows/baton-gates.yml` validates baton artifact signer aliases and role consistency against registry rules.
- Local enforcement: `node scripts/global/consultant-checks.js --issue <N>` includes signer/role consistency checks.
- Recovery when blocked:
  1. Rebuild the affected artifact text with `node scripts/global/baton-comment-build.js --artifact ... --role ... --team-model ... --ticket ...`.
  2. Repost corrected baton artifact comment on the linked issue.
  3. Re-run consultant checks and re-push.
- Manual `Signed-by` edits are not allowed for governed baton artifacts.

## Override rule

- When local rules differ, use the local alias/trailer format and keep canonical `Team&Model` provenance present.

## Cross-Team Artifact-Write Signing

`TEAM_QUESTION` and `TEAM_RESPONSE` comments in the cross-team artifact-write
sign-off workflow must carry standard signing fields. See
`instructions/cross-team-artifact-write.instructions.md` for the full contract.
