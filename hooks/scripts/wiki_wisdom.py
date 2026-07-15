#!/usr/bin/env python3
"""Read governance wisdom from Karpathy LLM Wiki pages.
Hook scripts import to pull context from wiki/ instead of hardcoding.
Falls back to short defaults if wiki pages are missing.
"""
import re
from pathlib import Path

from runtime_paths import wiki_candidates

_WIKI_ROOT = None


def _find_wiki() -> Path | None:
    global _WIKI_ROOT
    if _WIKI_ROOT is not None:
        return _WIKI_ROOT
    for c in wiki_candidates():
        if c.is_dir():
            _WIKI_ROOT = c
            return c
    _WIKI_ROOT = Path("/dev/null")
    return None


def _read_page(category: str, slug: str) -> str:
    wiki = _find_wiki()
    if not wiki or not wiki.is_dir():
        return ""
    page = wiki / category / f"{slug}.md"
    if not page.is_file():
        return ""
    try:
        text = page.read_text(encoding="utf-8")
    except OSError:
        return ""
    return re.sub(r"^---\n.*?^---\n", "", text, count=1, flags=re.M | re.S).strip()


def _extract_section(text: str, heading: str) -> str:
    pat = re.compile(rf"^##\s+{re.escape(heading)}\s*\n(.*?)(?=^##\s|\Z)", re.M | re.S)
    m = pat.search(text)
    return m.group(1).strip() if m else ""


def baton_protocol() -> str:
    body = _read_page("concepts", "baton-protocol")
    if body:
        rules = _extract_section(body, "Rules")
        seq = _extract_section(body, "Sequence")
        if rules:
            return f"Baton: {seq} | {rules}"[:300]
    return ("MANDATORY: Manager\u2192Collaborator\u2192Admin\u2192Consultant. "
            "One role active at a time. Events at every transition.")


def governance_enforcement() -> str:
    body = _read_page("concepts", "governance-enforcement")
    if body:
        layers = _extract_section(body, "Enforcement Layers")
        if layers:
            return f"Governance: {layers}"[:300]
    return ("Global standards: root-cause first, evidence before claims, "
            "secret-safe packaging, version integrity, docs-sync.")


def protocol_enforcement() -> str:
    body = _read_page("concepts", "protocol-enforcement")
    if body:
        return body[:400]
    return ""


def admin_steps() -> str:
    body = _read_page("concepts", "baton-protocol")
    if body:
        roles = _extract_section(body, "Role Responsibilities")
        if "Admin" in roles:
            return roles[:300]
    return ("Admin: commit, push, PR, CI-green, merge. "
            "Extension repos add: publish, integrity, release.")


def post_merge_checklist() -> str:
    body = _read_page("concepts", "governance-enforcement")
    if body:
        controls = _extract_section(body, "Key Controls")
        if controls:
            return f"Post-merge: {controls}"[:300]
    return ("Post-merge: CHANGELOG, README, repo-profile-governance, "
            "docs-drift-maintenance, learnings if significant.")
