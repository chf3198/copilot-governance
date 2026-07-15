# Epic #3811 — Manager Scope 🎯 (research-first)

**Title:** Session-attributable governance-gate substrate — eliminate the raw-working-tree
false-positive class and prevent recurrence
**Type:** epic · **Area:** hooks/governance · **Priority:** P2 · **Points:** 13 (research+plan first)
**Lane:** research → design → phased implementation
**Parent:** operator directive 2026-07-15 (post-#3810 discovery)
**Relates / lineage:** #3810 (fixed check_uncommitted), #2005 (fixed detect_session_signals),
#3054 (baseline_drift_override on check_admin_ops), #3749 (introduced classify_internal_conflict),
#3801 / #3026 (the intentional parked-checkout standing drift these gates misread)

---

## 1. Problem (confirmed, not hypothetical)

The Stop hook keeps false-positive-blocking session end on the parked `feat/3026` canonical checkout,
whose ~764-path standing baseline drift is **intentionally** uncommitted (#3801/#3026). #3810 fixed
**one** gate (`check_uncommitted`). Critical analysis during #3810 closeout **confirmed a second,
independent gate with the same blind spot**, and traced the pattern to a systemic root cause.

### Confirmed evidence (this session)
- `stop_reminder.py` computes `uncommitted = detect_uncommitted_changes(cwd)` **once** — a raw
  `git status --porcelain` set with **no session attribution** — and **fans it out to multiple gate
  consumers**.
- `classify_internal_conflict(uncommitted)` (client_arbitration_guard, added under #3749) returns a
  **catch-all `worktree-drift` for ANY non-empty set** (verified: `[]→none`, everything else →
  `worktree-drift`), and `stop_reminder` **hard-blocks on any `type != "none"`**.
- Net effect after #3810: the parked checkout **still blocks**, the reason merely changes
  `"…uncommitted changes; Admin baton incomplete."` → `"…unresolved internal conflict…"`.
- Override does not help: `baseline_drift_override` suppresses `check_uncommitted` (#3054/#3810) but
  **not** the worktree-drift path.

### Root cause (the "why", cluster-level)
Governance Stop-gates were each built **independently** to read **raw working-tree state** as a proxy
for "this session left work incomplete." Because the canonical checkout carries large **intentional**
standing drift, every such gate misreads that drift as fresh session activity. Fixes have been applied
**one consumer at a time, reactively** — #2005, #3054, #3810 — while new gates (#3749's worktree-drift)
**re-introduce** the antipattern because there is (a) **no shared session-attribution substrate** the
gates reuse and (b) **no prevention** that stops the next raw-working-tree gate from shipping the same
blind spot. This is a textbook **whack-a-mole / point-fix** anti-pattern: symptoms patched, class
alive.

### Why it matters (impact)
A governance gate that fires on state the operator deliberately parked is **noise**, and chronic noise
produces **governance fatigue** — operators learn to ignore or bypass Stop blocks, which silently
erodes the *real* Admin gate the mechanism exists to protect. (Industry framing: false positives are
the #1 detection complaint; the cost is un-actioned/ignored alerts, not the alert itself.)

---

## 2. Objective

**Get to the bottom of the class and close it durably**, in three moves:
1. **Root-cause research** — enumerate *every* gate that consumes raw working-tree/session state, map
   the shared blind spot, and ratify a single **session-attributable governance-gate substrate**
   design (reuse #3810's `session_baseline` as the seed).
2. **Remediate the confirmed live blocker** — make `worktree-drift` session-attributable **and**
   re-examine advisory-vs-blocking for it (it may never have been meant to hard-block Stop).
3. **Prevent recurrence** — ship a **meta-gate** that flags any new/modified Stop-gate consuming raw
   working-tree state without going through the attribution substrate, plus a codified
   **advisory → shadow → blocking** enforcement-mode model so gates roll out the way OPA
   Gatekeeper's `dryrun → warn → deny` progression does (never block workloads that pre-date the
   policy).

---

## 3. Research grounding (cutting-edge, 2025–2026)

Design must be ratified against current external expertise (cross-family review at Phase-0 exit):

- **Enforcement-mode gradual rollout** — OPA Gatekeeper's `deny | dryrun | warn`, promoted
  `dryrun → warn → deny` only once violation-count hits zero, exists **specifically to avoid blocking
  legitimate workloads that pre-date a policy** — the exact failure mode here. Adopt as the canonical
  gate lifecycle. (open-policy-agent.github.io/gatekeeper — Handling Constraint Violations.)
- **Alert-fatigue / false-positive suppression** — hysteresis + time-based suppression,
  "suppress repeat findings once acknowledged", and **promoting known-noise patterns into policy** are
  the standard mitigations; the baseline snapshot is exactly a "pre-acknowledged findings" suppressor.
  (incident.io 2025; vectra.ai; conifers.ai.)
- **Git dirty-tree detection** — raw dirtiness is a weak signal: prefer `git diff-index --quiet HEAD`,
  `git status --porcelain -z`, `--ignore-submodules=all`, and beware phantom `stat` changes; scope and
  attribute rather than treat "dirty" as "the session did something." (git list; ssbarnea gist;
  systutorials.)
- **Systemic vs point fix** — defect-**cluster** analysis finds the pattern; prevent whole classes via
  **tooling that catches the class**, not per-bug patches ("tooling investments where a tool would
  catch a bug class systematically"). Direct mandate for the meta-gate. (Bug0 defect analysis;
  JanPaul123 "Preventing regressions"; selementrix RCA.)

---

## 4. Phased plan

### Phase 0 — Research & Design (the heart of this Epic; research-lane)
**Child C0 (#3812 proposed):** Root-cause + literature synthesis + ratified design.
Deliverables:
- **Gate census**: every Stop/PreTool gate consuming working-tree or session state, each tagged
  `attributed | partially | RAW`, with the exact false-positive trigger. (Seed inventory in §6.)
- **Substrate design**: promote `session_baseline` into a shared attribution service all gates call
  (single source: "is path P attributable to THIS session on THIS branch?"), so no gate re-implements
  it. Include the fail-safe contract (unresolved ⇒ legacy) as an invariant.
- **Enforcement-mode model**: formal `advisory → shadow → blocking` lifecycle mapped to the repo's
  existing advisory-first norm + Gatekeeper progression; promotion gated on a shadow FP-rate metric.
- **worktree-drift disposition**: decide advisory-vs-blocking (evidence: its own policy text says
  "continue delivery"); design its session-attributable form.
- Ratify via **$0 cross-family panel** (research-redteam) → receipt. **Gate: no Phase-1 code until C0
  ratified.**

### Phase 1 — Remediate + Prevent (authorized only after C0)
- **C1 — worktree-drift session-attributable** (the confirmed live blocker): reuse the substrate;
  block only on session-attributable drift; fail-safe legacy; AC-parity with #3810. Likely
  downgrade the catch-all to advisory unless a genuine conflict class (sync-residue/lease) is present.
- **C2 — shared attribution substrate**: refactor `check_uncommitted` (#3810) + C1 to consume one
  `session_attribution` module; no behavior change to already-correct gates (characterization tests
  first).
- **C3 — recurrence meta-gate** (prevention): a `scripts/` validator that statically flags any hook
  consuming `git status --porcelain` / `detect_uncommitted_changes` and reaching a `block_reason`
  without passing through the substrate — advisory-first, ships with spec + self-test registry entry
  (#1893) + enforcement wiring (#3802/#3803). This is the anti-whack-a-mole.
- **C4 — enforcement-mode + fatigue telemetry**: codify the lifecycle; add a shadow FP-rate/
  governance-fatigue metric (extends enforcement-telemetry #3804) so promotion `shadow→blocking` is
  evidence-gated, and chronic over-blocking is observable (G8).
- **C5 — closeout**: end-to-end proof the parked checkout no longer false-blocks at Stop while a
  genuine session gap still blocks; Epic consensus close.

---

## 5. Acceptance criteria (Epic-level)

- [ ] **AC1** Phase-0 gate census enumerates every working-tree/session-state gate with an
      attribution tag + FP trigger; nothing in the Stop/PreTool path is left unclassified.
- [ ] **AC2** A single ratified **session-attribution substrate** design (seeded by `session_baseline`)
      that all gates reuse; fail-safe (unresolved ⇒ legacy, never fail-open) is an explicit invariant.
- [ ] **AC3** The confirmed **worktree-drift** live blocker is remediated (session-attributable +
      advisory/blocking decision recorded) — parked checkout no longer false-blocks at Stop end-to-end.
- [ ] **AC4** A **recurrence meta-gate** exists and is enforced (spec + registry + wiring) that fails/
      warns when a new raw-working-tree gate bypasses the substrate — proven against a seeded fixture.
- [ ] **AC5** A codified **advisory → shadow → blocking** enforcement-mode model + shadow FP-rate
      metric; every existing working-tree gate is placed on that lifecycle.
- [ ] **AC6** No weakening of any real gate (AC2-of-#3810 property generalized): a genuine
      session-authored uncommitted/conflict STILL blocks; characterization tests prove parity.
- [ ] **AC7** Phase-0 ratified by $0 cross-family consensus (receipt); each Phase-1 child CI-green +
      cross-family PASS; Epic close cross-family unanimous.

---

## 6. Seed gate inventory (to be completed in C0)

| Gate (stop_reminder path) | Source it reads | Attribution today | FP on parked drift |
|---|---|---|---|
| `check_uncommitted` | `detect_uncommitted_changes` | ✅ session-attributable (#3810) | fixed |
| `classify_internal_conflict` → `worktree-drift` | same raw set | ❌ **RAW** | **CONFIRMED live** |
| `check_admin_ops` (clean-tree + merge) | uncommitted + admin_ops | 🟡 partial (`baseline_drift_override` #3054) | mitigated-by-override only |
| `detect_session_signals` | `git log`/`git diff` | ✅ recent-commits-gated (#2005) | fixed |
| `client_arbitration` (assistant text) | payload text, not tree | N/A | out of class |
| `wiki_pending_message` | flags, not raw tree | N/A | out of class |

---

## 7. Scope (out — do NOT do here)

- **Not** re-parking / cleaning the actual `feat/3026` drift (that is #3801). This Epic fixes the
  GATES and the class, never the drift.
- **Not** a rewrite of #3749 client-arbitration semantics beyond the worktree-drift attribution +
  advisory/blocking disposition.
- **Not** cross-harness propagation (tracked separately).
- No Phase-1 implementation before Phase-0 (C0) is ratified.

## 8. Constraints / gates

G1 > G2 > G3; governance gates must **not fail-open**. Research-first: C0 is a research-lane child
(M → Collaborator(synthesis) → Consultant; Admin only if a PR). Branch `feat/3811-...` off
`origin/main`; commits reference `#3811` (children reference their own `#N`); `wiki/` gitignored →
`git add -f`; read-only-mirror → land via PR. Free-fleet-first for all panels (G3).

**Baton → Phase-0 research child (C0).**
