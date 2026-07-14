---
title: "#3799-AC1 Consultant closeout — independent critique + cross-family receipt"
type: baton-artifact
role: consultant
ticket: 3799
ac: AC1
created: "2026-07-14"
cross_family_receipt: "35d7328999ec3357"
---

# #3799-AC1 — Consultant CLOSEOUT

**Team & Model**: claude-code:opus@anthropic · **Signed-by**: Orla Vale · **Role**: consultant

## Independent cross-family ratification (AC5 slice for the hermetic-path design)
`node scripts/cross-family-consensus.js --ticket 3799 --kind review` →
**consensus: PASS**, **receipt `35d7328999ec3357`**, panel = groq[meta]=PASS + mistral[mistral]=PASS
(2 distinct non-Anthropic families; cerebras/gemini empty_response, not counted). Ratifies (a) the
env → in-repo → legacy resolution design and (b) keeping the in-repo fallback secret-free.

## Risk assessment
- **Correctness**: resolution order is total and terminates in a clear throw; existing dev machines
  keep prior behavior (in-repo alias values mirror the canonical registry; cryptoKey registry stays
  reachable via env/legacy). LOW.
- **Security (G4)**: in-repo file is asserted secret-free by a spec test (`!cryptoKeys` + no
  `PRIVATE KEY`). No signing material enters the repo. LOW.
- **Hermeticity (G6)**: verified by archive run on a clean, `.git`-less tree with no `../inventory`
  sibling — both `signer-alias.spec.js` and `baton-e2e.spec.js` exit 0. This is the deliverable's core
  proof and it holds. LOW.
- **Scope**: AC1 only. AC2/AC3/AC4 remain OPEN and tier-blocked; ticket stays OPEN. No carve-out
  weakened. Merge to unprotected mirror `main` is reversible → completed autonomously (G8).

## Autonomy-vs-escalate decision (G8)
Reversible path (feature-branch push + PR + merge to **unprotected** mirror `main`) → completed
autonomously per #3799 AC2 principle. No retained carve-out triggered (not protected-main, not
irreversible, not security-weakening — the change removes signing material from the repo, it does not
add it).

**Verdict: RELEASE.** AC1 complete and independently ratified.
