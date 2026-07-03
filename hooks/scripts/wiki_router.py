#!/usr/bin/env python3
"""Task-adaptive wiki context snippets for SessionStart hooks."""
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from runtime_paths import wiki_candidates


def _resolve_wiki(cwd: Path) -> Path | None:
    """Return first valid wiki dir: local cwd/wiki, then global candidates."""
    local = cwd / "wiki"
    if local.is_dir():
        return local
    for candidate in wiki_candidates():
        if candidate.is_dir():
            return candidate
    return None


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _section(text: str, heading: str) -> str:
    lines = text.splitlines()
    out, on = [], False
    for line in lines:
        if line.startswith("## "):
            on = line[3:].strip() == heading
            if out and not on:
                break
            continue
        if on and line.strip():
            out.append(line.strip())
    return " ".join(out)


def _recent_from_index(index_text: str, limit: int = 3) -> str:
    rows, on = [], False
    for line in index_text.splitlines():
        if line.startswith("## Recent Additions"):
            on = True
            continue
        if on and line.startswith("## "):
            break
        if on and line.startswith("- "):
            rows.append(line[2:].strip())
    return " | ".join(rows[:limit])


def route_wiki_context(cwd: Path, repo_type: str, signals: list[str]) -> list[str]:
    """Return small, high-value wiki snippets based on repo signals."""
    wiki = _resolve_wiki(cwd)
    if wiki is None:
        return []
    msgs = []
    index_text = _read(wiki / "index.md")
    if index_text:
        recent = _recent_from_index(index_text)
        if recent:
            msgs.append(f"Wiki recent additions: {recent}")
    wp = _read(wiki / "concepts" / "wiki-pattern.md")
    core = _section(wp, "Core Idea") if wp else ""
    if core:
        msgs.append(f"Wiki pattern reminder: {core}"[:260])
    if ("node-or-extension-repo" in signals) and (cwd / "dashboard").exists():
        gold = _read(wiki / "syntheses" / "dashboard-codebase-gold-rules.md")
        if gold:
            msgs.append(f"Dashboard synthesis loaded: {gold.splitlines()[0]}"[:180])
    if repo_type in {"web-app", "website-static"}:
        tl = _read(wiki / "concepts" / "ticket-lifecycle-v1.md")
        seq = _section(tl, "Sequence") if tl else ""
        if seq:
            msgs.append(f"Ticket lifecycle sequence: {seq}"[:260])
    return msgs[:4]
