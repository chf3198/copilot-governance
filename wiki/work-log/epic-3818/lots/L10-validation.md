# Epic #3818 — Lot L10 (scripts · anneal + harness) Validation

**Lot:** L10 — `^scripts/(anneal|harness)-` · **Branch:** `feat/3818-L10-capture` · **Base:** `origin/main` (8d3766e)
**Disposition:** faithful, content-only capture. Nothing held/discarded. 1 pre-existing-broken spec captured as-is + follow-up filed.

## Segment research (2025–2026, $0 web pass)

Validated the anneal/harness logic against current best practice for self-healing/self-annealing systems:
**confidence-gated autonomous remediation** (classify breakage by failure signature; auto-correct only
above a confidence threshold, else escalate to human review), playbook-based responses, and distinguishing
environmental instability from genuine functional drift. The captured anneal aggregators/sensors/reviewers
align. No hold/discard candidates. Sources: infosys self-healing-systems auto-remediation · testriq
self-healing-test-automation · arxiv Self-Healing Software Systems (2504.20093).

## Capture result

- **Manifest** (`-uall`): **39 file-level entries** (0 directories). All `??` (new/untracked). All `.js`.
- **cmp vs canonical source:** 39/39 **cmp-clean, 0 mismatches**.
- **Staged (exact manifest paths):** **39 files** = 39 new (`A`), **0 deletions**; staged == manifest (**EXACT**).
- `rollback/L10.pre.patch` empty (all untracked).

## Rollback compensator (written BEFORE capture)

- `rollback/L10.manifest` (39 entries) · `rollback/L10.pre.patch` (empty).
- Pre-merge revert: `gh pr close` + delete branch + claim. Post-merge: `git revert -m 1 <sha>` PR.

## Test gate — GREEN (with one documented pre-existing failure, faithfully captured)

- `node --check` — 39/39 `.js` OK.
- Lot self-tests: **5/6 pass** — `anneal-audit-sensor`, `anneal-event-schema` (33/33), `anneal-log-rotate`,
  `anneal-review`, `anneal-schedule-health` all PASS.
- **6th spec `anneal-tier1-aggregator.spec.js` — pre-existing failure, captured as-is:** throws `ENOENT`
  on a **hardcoded absolute path** `~/tests/fixtures/anneal-tier1-sensors.json` that **does not exist
  anywhere** (home, canonical, or origin/main) and **fails identically against the canonical source-of-truth
  copy** → NOT a capture regression (captured file is `cmp`-clean/byte-identical). **Not run by any CI job**
  (CI runs only named validator specs; no generic spec-runner). Per the *hold-don't-fix* rail, captured
  faithfully and a follow-up filed (no inline behavioral edit): see
  `wiki/work-log/epic-3818/followups/L10-anneal-tier1-aggregator-spec-broken.md`.
- Content-only assertion — staged only `scripts/**` (L10 glob) + `epic-3818/` docs; no strays; no deletions.
- `governance-verify` — **PASS**. `validator-discipline` — **OK**. `enforcement-wiring-audit` — exit 0
  (advisory; 222 UNWIRED = faithful operational-CLI state).

## Cross-family consensus

- **Receipt:** `cd4b6babef7b5292` · **consensus: PASS** — **meta** (groq) PASS, **mistral** PASS.
  Panel explicitly ratified capturing the pre-existing-broken spec as-is + follow-up.

## Holds / discards / follow-ups

- **Holds/discards:** none.
- **Follow-up (filed, not fixed inline):** `anneal-tier1-aggregator.spec.js` missing-fixture / hardcoded
  `$HOME`-absolute path defect — see the followups/ doc. Behavioral fix belongs in its own `fix/<N>` branch.
