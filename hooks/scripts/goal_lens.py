#!/usr/bin/env python3
"""UserPromptSubmit hook: inject G1-G10 decision lens + operator-autonomy context.

Per Epic #1113 AC5 (extends D-009 #1123 hybrid): full tier ladder
B / B+ / B++ / B+++ / B++++ resolved from goal-tier-state.json + role.
Tier ladder strings + resolver live in goal_tier_resolver.py.
Epic #3391: also injects the cross-cutting operator-autonomy principle (Option B).
"""
import json
import os
import re
import sys

from goal_tier_resolver import (
    read_tier_from_state, resolve_tier, context_for_tier,
)

GOALS = (
    "G1 Governance > G2 Quality > G3 Zero Cost > G4 Privacy & Security > "
    "G5 Portability > G6 Resilience > G7 Throughput > "
    "G8 Observability > G9 Interoperability > G10 Maintainability"
)

# Epic #3391 (Option B): operator autonomy is a cross-cutting, always-on PRINCIPLE
# (not a ranked goal). Injected alongside the priority sentence on every prompt.
AUTONOMY = (
    "Operator autonomy (always-on principle): resolve reversible/low-risk work autonomously "
    "(free cross-model panel, never a bare client prompt); reach the human only at the 4 retained "
    "carve-outs (design/UAT/irreversible/security-weakening); never override C-G1 or C-G4; log the "
    "autonomy-vs-escalate decision (G8)."
)

ANNEAL_RE = re.compile(
    r"\b(anneal|self-anneal|recurr|mid-flight|tier-2|repeat failure|pattern)\b",
    re.IGNORECASE,
)

DECISION_RE = re.compile(
    r"\b(decide|decision|choose|tradeoff|priority|prioritize|rank|route|"
    r"policy|architecture|design|should we|which option|compare)\b",
    re.IGNORECASE,
)

# Epic #1436 D-1436-01: in-session Tier-2 worker awareness.
# When prompts mention recurrence/anneal/repeat-failure patterns, surface
# concise guidance reminding the worker that a Tier-2 anneal event should
# be emitted proactively, without waiting for the nightly cron.
RECURRENCE_RE = re.compile(
    r"\b(anneal|self-anneal|tier-?2|mid-?flight|"
    r"recurr(?:ence|ent|ing)?|repeat(?:ed)?\s+failure|"
    r"happened\s+again|same\s+error\s+twice|drift\s+pattern)\b",
    re.IGNORECASE,
)
RECURRENCE_GUIDANCE = (
    "Tier-2 mid-flight awareness (#1436): if this is a recurring pattern "
    "(≥2 in 7d at severity ≥ medium), emit `event:goal-failure-escalation` "
    "or file a Tier-2 anneal ticket NOW — do not wait for the nightly cron. "
    "See `instructions/workflow-resilience.instructions.md` Tier-2 model "
    "and `feedback_anneal_emission_during_implementation.md`."
)


def get_active_role(payload: dict) -> str:
    """Resolve active role from payload or env (lowercase, stripped)."""
    role = str(payload.get("role", "")).lower().strip()
    if role:
        return role
    return os.environ.get("MEGINGJORD_ROLE", "").lower().strip()


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    prompt = str(payload.get("prompt", ""))
    if not prompt:
        return 0

    base = f"Goal lens: {GOALS}. {AUTONOMY}"
    if DECISION_RE.search(prompt):
        base += " Decision check: justify any lower-priority override with explicit evidence."
    if ANNEAL_RE.search(prompt):
        base += (
            " Anneal awareness: if a recurrence pattern is observed mid-flight, "
            "surface or file the Tier-2 signal now instead of waiting for the nightly cron."
        )

    if RECURRENCE_RE.search(prompt):
        base += " " + RECURRENCE_GUIDANCE

    role = get_active_role(payload)
    tier = resolve_tier(read_tier_from_state(), role)
    base += context_for_tier(tier)

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": base,
            "goalLensTier": tier,
        }
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
