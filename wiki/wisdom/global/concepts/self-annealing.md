---
title: "Self-Annealing Protocol"
type: concept
created: 2026-04-14
updated: 2026-05-10
tags: [governance, workflow]
sources: []
related: ["[[agent-drift]]", "[[baton-protocol]]", "[[governance-enforcement]]", "[[distributed-self-anneal]]", "[[andon-pull-protocol]]"]
status: draft
---

# Self-Annealing Protocol

Bounded review cycle that detects and corrects operational drift.

## When to Run
- After failures or repeated mismatches
- After long sessions (>10 tool calls)
- Before merge or release
- When process violations are detected

## Protocol Steps
1. Collect evidence (events, comments, artifacts)
2. Compare against expected protocol
3. Score drift (0-10 scale)
4. Identify specific deviations
5. Apply corrections (retroactive if needed)
6. Document findings in Consultant CLOSEOUT

## Three-tier extension (Epic #1308)

The base protocol above corresponds to the Tier-2 mid-flight pivot phase. Distributed any-role pull (Tier 1) and Consultant goal-failure escalation (Tier 3) extend it. See:
- [[distributed-self-anneal]] — three-tier model
- [[andon-pull-protocol]] — any-role pull mechanics, severity classification, pivot semantics

## Integration Points
- [[baton-protocol]] Consultant phase triggers review
- Event bus provides audit trail (`~/.megingjord/incidents.jsonl` schema v2)
- wiki/log.md captures operational history

See: [[agent-drift-recommendations]], [[distributed-self-anneal]], [[andon-pull-protocol]]
