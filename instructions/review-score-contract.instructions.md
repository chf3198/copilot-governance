---
title: Review-score governance contract v1
type: design
created: 2026-05-17
status: active
ticket: 1748
parent_epic: 1745
---

# Review-score governance contract v1 (#1748)

## Authority

Phase 2 design output for Epic #1745. Consumes inventory findings (#1746) and calibration research (#1747). Specifies the canonical contract that Phase 3 implements (#1749), Phase 4 integrates (#1750), Phase 5 tests (#1751).

## Contract surface

Every CONSULTANT_CLOSEOUT artifact that scores a governed ship emits a structured `review_score` record with the following fields:

```json
{
  "score": 87,
  "band": "B",
  "tier": 1,
  "action": "log-tier1-event",
  "mean": 8.7,
  "rubric_version": "g1-g9-v2",
  "policy_version": "2026-05-17",
  "reviewer_identity": "claude-code:opus-4-7@anthropic/role:consultant",
  "confidence": 0.85,
  "agreement": null,
  "provisional": false
}
```

Fields are normative; new fields are additive-only (Expand-Contract pattern from event-schema-v2 lineage).

## Score scale

**Path A from #1746 inventory**: existing `scripts/global/rubric-score.js` outputs 0–10 per goal + 0–10 mean. Phase 3 classifier multiplies mean by 10 to produce a 0–100 integer score. Preserves the deterministic scorer + tests + evidence DSL unchanged.

```
score_100 = round(mean_0_to_10 * 10)
```

## Band system (5-band ordinal)

Per #1747 R1 — percentile-derived bands. Initial cutoffs are **placeholders pending calibration corpus**; classifier accepts cutoffs via env override.

| Band | Letter | Score | Tier | Action |
|---|---|---|---|---|
| 5 | A | 90–100 | 0 | None (default approve) |
| 4 | B | 80–89  | 1 | Log Tier-1 observation event |
| 3 | C | 70–79  | 2 | File Tier-2 follow-on at P3 |
| 2 | D | 60–69  | 2 | File Tier-2 follow-on at P2 |
| 1 | F | 0–59   | 3 | File Tier-3 self-anneal at P1 + consultant escalation |

**Promotion to required mode**: gated on calibration corpus ≥50 human-scored closeouts AND replay-eval (#1771) showing classifier agreement ≥85% with human band. Until then, **all classifier output is advisory**.

## Confidence + agreement gating (#1747 R2)

Tier-3 self-anneal filing requires:

- `band == 'F'` AND
- `confidence >= 0.85` (reviewer self-report or inter-reviewer) AND
- `agreement >= 0.85` OR `agreement === null` (cross-family-reviewer disagreement ≥20% downgrades to Tier-1 log + calibration review)

A single reviewer scoring F with low confidence does NOT auto-file a self-anneal. Avoids the single-reviewer false-positive failure mode documented in 2026 sources.

## Provisional flag (#1811 bridge)

Until Phase 3 ships, operators emitting prose-form rubric values without invoking the classifier MUST mark closeouts with `rubric_provisional: true` or `provisional: true` in the rubric block. The closeout-schema validator (Phase 4 patch) recognizes the flag and accepts the closeout with an advisory pointing at this Epic.

When Phase 3 ships and the classifier is invoked, `provisional: false` (or absent) is the default. The advisory becomes a hard fail only after the calibration corpus exists.

## Audit trail (#1747 R5)

Every classifier invocation appends to `~/.megingjord/incidents.jsonl` an event of shape:

```json
{
  "version": 2,
  "timestamp": "2026-05-17T...",
  "tier": 1,
  "trigger_role": "consultant",
  "trigger_type": "review-score",
  "severity": "low",
  "pattern_id": "review-score-1745",
  "evidence": {
    "score": 87, "band": "B", "rubric_version": "g1-g9-v2",
    "policy_version": "2026-05-17", "ticket_ref": "#NNNN",
    "confidence": 0.85, "agreement": null
  },
  "session_id": "..."
}
```

Existing `anneal-event-schema.js` v2 schema already supports this — no schema migration required.

## Verifiable + judged separation (#1747 R4)

Phase 1 deliberately scopes to **verifiable scoring only** (the existing `rubric-score.js` evidence-command DSL is deterministic / verifiable). LLM-judge integration (e.g., Qwen, cross-family reviewer scoring) is **deferred to a future Epic** because:

- LLM-judge calibration is a separate problem space (#1747 cited Deepchecks 2026)
- Composition with verifiable score requires its own design (weighting, disagreement-handling)
- A "review-quality optimization" Epic should address this — research in progress per follow-on ask

Phase 3 classifier accepts an optional `llm_judge_score` field but does not USE it in `action` derivation in v1. Future v2 can add weighted composition without schema break (additive only).

## CLI contract

```bash
# Score + classify in one call
node scripts/global/review-score-classifier.js \
  --trail trail.txt --diff diff.txt --closeout closeout.txt \
  [--rubric inventory/rubric-g1-g9-v2.json] \
  [--confidence 0.85] [--agreement 0.90] \
  [--json]

# Output JSON (default) or human-readable
```

Exit 0 on success regardless of band (the classifier is observation only in advisory mode). Future hard-fail mode: exit 1 when `band == 'F'` and `tier == 3` and `confidence/agreement` thresholds met.

## Phase mapping

| Phase | Ticket | Deliverable |
|---|---|---|
| 2 | #1748 (this doc) | Contract spec |
| 3 | #1749 | `scripts/global/review-score-classifier.js` + helpers |
| 4 | #1750 | Closeout-schema integration + `rubric_provisional` recognition (also closes #1811 AC3) |
| 5 | #1751 | `tests/review-score-classifier.spec.js` covering all band boundaries + confidence gates |

## Out of scope for v1

- LLM-as-judge composition (deferred to future "review-quality optimization" Epic).
- Hard-fail promotion (gated on calibration corpus; future replay-eval validation).
- Auto-ticket-filing for Tier-3 actions (Phase 4 emits incidents.jsonl events; auto-ticketing is a separate ship to minimize blast radius).
- Migration from Playwright to node --test for rubric-score spec (deferred; #1746 gap 5).

G10 (Maintainability) in rubric: SHIPPED in v3 (`inventory/rubric-g1-g10-v3.json`) per #1967 (closes #1746 gap 4). Scorer accepts both v2 and v3; existing v2 closeouts remain valid.

## Related

- Closes #1748.
- Composes with Epic #1745 (parent), #1746 (inventory), #1747 (calibration), #1771 (replay-eval pattern for promotion).
- Bridges #1811 (provisional-rubric marker honored by Phase 4 patch).
