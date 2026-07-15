#!/usr/bin/env python3
"""Record visual QA completion in governance state."""
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from governance_state import ensure_state, save_state


def record_visual_qa(cwd: str, evidence: dict) -> None:
    state = ensure_state(cwd)
    state["admin_ops"]["visual_qa"] = True
    state.setdefault("visual_qa_evidence", [])
    state["visual_qa_evidence"].append(evidence)
    save_state(state)


def main() -> int:
    cwd = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    evidence = {
        "url": sys.argv[2] if len(sys.argv) > 2 else "unknown",
        "mode": sys.argv[3] if len(sys.argv) > 3 else "fullPage",
        "verdict": sys.argv[4] if len(sys.argv) > 4 else "pass",
    }
    record_visual_qa(cwd, evidence)
    print(json.dumps({"recorded": True, "evidence": evidence}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
