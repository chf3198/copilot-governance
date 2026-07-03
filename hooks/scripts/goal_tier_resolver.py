"""Goal-tier resolver for goal_lens.py — Epic #1113 AC5.

Reads ~/.megingjord/goal-tier-state.json (written by actuator-engine.js A1)
and resolves the effective tier for the current session, combining:
  - state-derived tier (B / B+ / B++ / B+++ / B++++) from GHS thresholds
  - role-minimum (Consultant role floor at B+ per D-009 #1123 hybrid)
#3342: stale GHS telemetry decays to baseline B (no false elevation).
"""
import datetime
import json
import os
import pathlib

TIER_STATE_PATH = pathlib.Path.home() / ".megingjord" / "goal-tier-state.json"
TIER_ORDER = ["B", "B+", "B++", "B+++", "B++++"]
GHS_FRESHNESS_SECONDS = int(os.environ.get("GHS_FRESHNESS_SECONDS", str(7 * 24 * 3600)))

DEFINITIONS_TIER_B_PLUS = (
    "Goal definitions: "
    "G1 Governance: policy, role, provenance, ticket controls non-negotiable. "
    "G2 Quality: maximize correctness and engineering value. "
    "G3 Zero Cost: prefer local/fleet/free lanes before paid providers. "
    "G4 Privacy: keep sensitive context local unless explicit override. "
    "G5 Portability: avoid user-specific coupling; settings-driven. "
    "G6 Resilience: graceful degradation; fallback paths. "
    "G7 Throughput: acceptable speed after higher-priority goals met. "
    "G8 Observability: decisions visible, auditable, attributable. "
    "G9 Interoperability: preserve compatibility across runtimes."
)
TIER_B_PLUS_PLUS_NOTE = (
    "Tier B++ (#1113): recent governance violations elevated. Cite "
    "evidence for any G3-or-lower override; consultant pre-check advised."
)
TIER_B_PLUS_PLUS_PLUS_NOTE = (
    "Tier B+++ (#1113): per-role goal reminders active. Manager: scope. "
    "Collaborator: validate. Admin: gate. Consultant: critique independently."
)
TIER_B_QUAD_PLUS_NOTE = (
    "Tier B++++ (#1113): consultant pre-action review FORCED on this work. "
    "Post a consultant_pre_action_check artifact before continuing."
)


def ghs_is_stale(data, now=None):
    """#3342: True when GHS telemetry is absent or older than the freshness window."""
    ref = now or datetime.datetime.now(datetime.timezone.utc)
    newest = None
    for entry in (data or {}).get("ghs_history") or []:
        try:
            dt = datetime.datetime.fromisoformat(
                str((entry or {}).get("ts")).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        if newest is None or dt > newest:
            newest = dt
    return newest is None or (ref - newest).total_seconds() > GHS_FRESHNESS_SECONDS


def read_tier_from_state(state_path=TIER_STATE_PATH) -> str:
    """Read tier; default B. #3342: decay a stale elevation to B (GHS_DECAY_DISABLED=1 to opt out)."""
    try:
        data = json.loads(pathlib.Path(state_path).read_text(encoding="utf8"))
        tier = (((data or {}).get("actuators") or {}).get("A1") or {}).get("tier")
        if isinstance(tier, str) and tier in TIER_ORDER:
            if (tier != "B" and os.environ.get("GHS_DECAY_DISABLED") != "1"
                    and ghs_is_stale(data)):
                return "B"
            return tier
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return "B"


def resolve_tier(state_tier: str, role: str) -> str:
    """Resolve effective tier: max(state, role==consultant ? B+ : B)."""
    role_minimum = "B+" if role == "consultant" else "B"
    state_idx = TIER_ORDER.index(state_tier) if state_tier in TIER_ORDER else 0
    role_idx = TIER_ORDER.index(role_minimum)
    return TIER_ORDER[max(state_idx, role_idx)]


def context_for_tier(tier: str) -> str:
    """Return additional context string for tiers >= B+ (empty for B)."""
    parts = []
    if TIER_ORDER.index(tier) >= TIER_ORDER.index("B+"):
        parts.append(DEFINITIONS_TIER_B_PLUS)
    if TIER_ORDER.index(tier) >= TIER_ORDER.index("B++"):
        parts.append(TIER_B_PLUS_PLUS_NOTE)
    if TIER_ORDER.index(tier) >= TIER_ORDER.index("B+++"):
        parts.append(TIER_B_PLUS_PLUS_PLUS_NOTE)
    if TIER_ORDER.index(tier) >= TIER_ORDER.index("B++++"):
        parts.append(TIER_B_QUAD_PLUS_NOTE)
    return " " + " ".join(parts) if parts else ""
