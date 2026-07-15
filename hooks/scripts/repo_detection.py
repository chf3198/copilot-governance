#!/usr/bin/env python3
"""Repository type detection and path classification."""
from __future__ import annotations

import json
from pathlib import Path

DOC_EXTS = {".md", ".rst", ".adoc"}
CODE_EXTS = {
    ".sh", ".bash", ".js", ".ts", ".py", ".go", ".rs",
    ".java", ".c", ".cpp", ".json", ".yml", ".yaml", ".toml",
}


def detect_repo_type(cwd: str) -> str:
    """Classify repository by inspecting project files."""
    p = Path(cwd)
    if (p / "vscode-extension" / "package.json").exists() or (
        p / "mem-watchdog.sh"
    ).exists():
        return "vscode-extension"
    package_json = p / "package.json"
    if package_json.exists():
        try:
            pkg = json.loads(package_json.read_text(encoding="utf-8"))
        except Exception:
            pkg = {}
        deps = {
            **(pkg.get("dependencies") or {}),
            **(pkg.get("devDependencies") or {}),
        }
        dep_keys = {str(k).lower() for k in deps.keys()}
        if any(
            k in dep_keys
            for k in ("react", "next", "vue", "svelte", "@angular/core")
        ):
            return "web-app"
        if pkg.get("engines", {}).get("vscode"):
            return "vscode-extension"
        if any(p.glob("**/*.html")) and any(p.glob("**/*.css")):
            return "website-static"
        return "library-sdk"
    has_workflows = (p / ".github" / "workflows").exists()
    has_many_shell = len(list(p.glob("**/*.sh"))) >= 3
    if has_workflows and has_many_shell:
        return "infra-automation"
    if any(p.glob("**/*.html")) and any(p.glob("**/*.css")):
        return "website-static"
    return "generic"


UI_EXTS = {".html", ".css", ".tsx", ".jsx", ".vue", ".svelte"}
UI_PREFIXES = ("dashboard/", "public/", "src/components/", "src/pages/", "src/views/")


def classify_path(path: str) -> str:
    """Classify a file path as docs, extension, ui, code, or other (#1817)."""
    lp = path.lower()
    ext = Path(lp).suffix
    if "/docs/" in lp or lp.endswith("readme.md") or lp.endswith("changelog.md") or ext in DOC_EXTS:
        return "docs"
    if lp.startswith("vscode-extension/") or "/vscode-extension/" in lp:
        return "extension"
    if ext in UI_EXTS or any(lp.startswith(p) or f"/{p}" in lp for p in UI_PREFIXES):
        return "ui"
    if ext in CODE_EXTS:
        return "code"
    return "other"
