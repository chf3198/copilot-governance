#!/usr/bin/env python3
"""Guardrail for client-arbitration leakage and internal conflict policy.

#3749 (R3 of #3059): the guard no longer merely DETECTS + LOGS a narrow
conflict-keyworded client-defer — it recognizes ANY non-carve-out deferral of an
internal decision to the client and ACTIVELY redirects the operator into the
shipped free cross-model panel `adjudication-guardrail.decide()` (never a client
prompt). The 4 human carve-outs (design/UAT, irreversible, security-weakening)
remain the sole sanctioned client-escalation path. Mirrors the in-process
adjudicate-first precedent in `pretool_guard.py` S6/S7 (#3403) — a fast,
deterministic Python decision, no synchronous network panel inside the Stop hook
(G7); cross-model consensus (llama+mistral, unanimous, median 85) selected this
over a synchronous node-CLI panel.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
import re

INCIDENTS_LOG = Path.home() / ".megingjord" / "incidents.jsonl"

# Higher-severity subclass tag only — no longer a precondition for detection
# (#3749 broadened detection beyond conflict-keyworded prose).
CONFLICT_CONTEXT_RE = re.compile(
    r"\b(governance|worktree|branch|drift|conflict|lease|sync(?:\s|-)?residue|team)\b",
    re.IGNORECASE,
)
FORBIDDEN_ASK_RE = re.compile(
    r"\b(how\s+would\s+you\s+like\s+(?:me\s+)?to\s+proceed|"
    r"which\s+option\s+should\s+i\s+take|"
    r"let\s+me\s+know\s+how\s+you\s+want\s+to\s+proceed|"
    r"please\s+choose\s+(?:one|an?\s+option)|"
    r"what\s+should\s+i\s+do\s+next)\b",
    re.IGNORECASE,
)
# --- 4 human carve-outs (mirror adjudication-guardrail.js HUMAN_CARVEOUT) ---
# Deliberately NARROW (JS-parity): only genuine visual/UX-direction terms are a client
# carve-out. Bare "design" is intentionally NOT here — a "software/API design" dev decision
# must adjudicate, not be waved through as a client touchpoint (cross-family critique #3749).
DESIGN_UAT_RE = re.compile(
    r"\b(design\s+direction|visual\s+design|colou?r\s+palette|UAT|user\s+acceptance|"
    r"visual\s+confirmation|look\s+and\s+feel|brand|aesthetic)\b",
    re.IGNORECASE,
)
IRREVERSIBLE_RE = re.compile(
    r"\b(irreversible|destroy|permanently\s+delete|wipe|unrecoverable|"
    r"force[- ]push\s+to\s+main|drop\s+(?:database|table))\b",
    re.IGNORECASE,
)
SECURITY_WEAKENING_RE = re.compile(
    r"\b(disable|weaken|remove|broaden|widen|bypass)\b[\w\s]{0,40}"
    r"\b(guard|gate|check|protection|control|enforcement|security|governance|permissions?)\b",
    re.IGNORECASE,
)

SYNC_RESIDUE_FILES = {
    "scripts/global/post-merge-sweep.js",
}
SYNC_RESIDUE_DIRS = (
    "wiki/concepts/",
    "wiki/entities/",
    "wiki/skills/",
    "wiki/sources/",
    "wiki/syntheses/",
)


def extract_assistant_text(payload: dict) -> str:
    """Best-effort extraction of assistant output from hook payload."""
    keys = ("assistant_response", "response", "output", "final_response", "message")
    for key in keys:
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val
    return ""


def human_carveout(text: str) -> str | None:
    """Return the carve-out tier if `text` is one of the 4 sanctioned client
    touchpoints, else None. These — and ONLY these — legitimately reach the client.
    """
    if DESIGN_UAT_RE.search(text):
        return "design-uat"
    if IRREVERSIBLE_RE.search(text):
        return "irreversible"
    if SECURITY_WEAKENING_RE.search(text):
        return "security-weakening"
    return None


def detect_client_arbitration(text: str) -> list[str]:
    """Return a violation when the assistant defers a NON-carve-out internal decision
    to the client. #3749: broadened from the old FORBIDDEN_ASK AND CONFLICT_CONTEXT
    conjunction to `FORBIDDEN_ASK AND NOT human_carveout` — any deferral phrasing that
    is not a design/UAT/irreversible/security-weakening carve-out is flagged, so the
    conflict-keyword narrowness no longer lets non-conflict defers slip through.
    Fail-safe: never raises (a crash would break the Stop hook).
    """
    try:
        if not text or not FORBIDDEN_ASK_RE.search(text):
            return []
        if human_carveout(text):
            return []
        return ["delegated-internal-conflict-decision-to-client"]
    except Exception:
        return []


def adjudication_redirect(text: str, violations: list[str] | None = None) -> dict:
    """Build the ACTIVE redirect record for a detected non-carve-out client-defer.
    Returns the routing directive (naming the exact decide() invocation) plus a
    structured record for the G8 routing incident. NEVER a client prompt: the
    operator runs the free cross-model panel and executes its verdict.
    """
    subclass = "internal-conflict" if CONFLICT_CONTEXT_RE.search(text or "") else "general-decision"
    directive = (
        "ROUTE TO ADJUDICATION — do NOT defer this decision to the client. Resolve it "
        "autonomously via the free cross-model panel:\n"
        "  node -e \"require('./scripts/global/adjudication-guardrail')"
        ".decide({question:'<the decision>', options:['<opt-a>','<opt-b>'], flags:{needsOpinion:true}})"
        ".then(r=>console.log(r.route, r.chosenLabel||r.rationale))\"\n"
        "Then execute the returned option. The 4 human carve-outs "
        "(design/UAT, irreversible, security-weakening) are the ONLY sanctioned client escalation."
    )
    return {
        "route": "adjudicate",
        "carveout": False,
        "subclass": subclass,
        "violations": violations or ["delegated-internal-conflict-decision-to-client"],
        "directive": directive,
    }


def classify_internal_conflict(uncommitted: list[str]) -> dict:
    """Deterministic classifier for common internal conflict classes."""
    files = [f.strip() for f in (uncommitted or []) if f and f.strip()]
    if not files:
        return {"type": "none", "files": [], "policy": []}

    if any(f in SYNC_RESIDUE_FILES for f in files) or any(
        f.startswith(prefix) for f in files for prefix in SYNC_RESIDUE_DIRS
    ):
        return {
            "type": "sync-residue",
            "files": files,
            "policy": [
                "git restore scripts/global/post-merge-sweep.js",
                "git clean -fd wiki/concepts wiki/entities wiki/skills wiki/sources wiki/syntheses",
                "git status --short",
            ],
        }

    if any("cross-team-leases.json" in f for f in files):
        return {
            "type": "cross-team-lease-collision",
            "files": files,
            "policy": [
                "node scripts/global/cross-team-conflict-gate.js --post-comment 1",
                "apply manager adjudication from issue thread",
                "continue on lease owner decision without client escalation",
            ],
        }

    return {
        "type": "worktree-drift",
        "files": files,
        "policy": [
            "preserve-first: commit to rescue branch OR revert local drift deterministically",
            "record evidence in issue comment",
            "continue delivery without client arbitration",
        ],
    }


def emit_incident(pattern_id: str, evidence: list[str] | None = None, severity: str = "high") -> bool:
    """Best-effort incident emission for anneal pipelines."""
    event = {
        "version": 3,
        "ts": datetime.now(timezone.utc).isoformat(),
        "service": "stop-hook-client-arbitration-guard",
        "env": "local",
        "event": "governance.client_arbitration_block",
        "pattern_id": pattern_id,
        "severity": severity,
        "evidence": evidence or [],
    }
    try:
        INCIDENTS_LOG.parent.mkdir(parents=True, exist_ok=True)
        with INCIDENTS_LOG.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(event) + "\n")
        return True
    except Exception:
        return False
