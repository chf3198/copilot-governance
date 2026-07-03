---
wiki_type: wisdom
scope: global
content_hash: pending
last_updated: 2026-06-28
freshness_window: none
content_trust_score: 0.9
---

# Baton Authority Plane — the shared FSM core (W1a, #3287)

The `baton-fsm` core (`scripts/global/baton-fsm/`) is the single deterministic evaluator both local
hooks (advisory UX) and CI (authority) import, so every team/runtime reaches byte-identical verdicts.

- **Pure kernel** — `kernel.js` `decide(stateCode, eventCode, evidenceMask) -> packedI32`. No IO,
  clock, env, or randomness. The packed i32 (decision | reasonCode | requiredNextState) is the
  byte-identical verdict unit.
- **WASM canonical target** — `kernel.wasm` is emitted by the zero-dependency pure-JS encoder
  `build-wasm.js` and reproduces the JS kernel exactly (parity-tested). The JS reference is the
  conformance oracle (per the Phase-0 plan); the full {Py,Go,Rust} runtime matrix is W1b (#3288).
- **Signed, hash-chained verdicts** — every verdict is Ed25519-signed (`baton-signing.js`) and
  appended to a hash-chained log with monotonic sequence + per-entry nonce (replay-protection).
- **Evidence provenance** — evidence carries a signed envelope; the host re-hashes and verifies it
  before the pure kernel runs, so spoofed/forged evidence is rejected (never reaches `decide`).
- **Fail-closed grammar** — `grammar.js` maps artifact text to canonical tokens via a published
  deterministic ruleset; anything out-of-grammar fails closed (no intent-guessing).
- **Independent versioning** — `fsm_version` and `grammar_version` are separate semver fields.

Encoded guards include the #3051 worktree-merge precondition (admin handoff/merge requires
`WORKTREE_MERGE_OK`) and the #3251 Admin->Collaborator baton-back (`BATON_BACK_REASON`).

See [[ticket-lifecycle-v1]] for the state taxonomy and Epic #3284 / #3285 for the full design.
