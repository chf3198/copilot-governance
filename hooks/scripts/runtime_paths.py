#!/usr/bin/env python3
"""Shared runtime path helpers for Copilot/Codex/Antigravity hook parity."""
from __future__ import annotations

import os
from pathlib import Path


def _home(var: str, default: str) -> Path:
    return Path(os.getenv(var) or default).expanduser()


def runtime_name() -> str:
    return (os.getenv("DEVENT_OPS_RUNTIME") or "copilot").strip().lower()


def codex_home() -> Path:
    return _home("CODEX_HOME", "~/.codex")


def copilot_home() -> Path:
    return _home("COPILOT_HOME", "~/.copilot")


def codex_managed_root() -> Path:
    return codex_home() / "devenv-ops"


def _ordered(codex: Path, copilot: Path) -> list[Path]:
    return [codex, copilot] if runtime_name() == "codex" else [copilot, codex]


def repo_scope_candidates() -> list[Path]:
    custom = os.getenv("DEVENT_OPS_REPO_SCOPE_PATH")
    paths = _ordered(codex_managed_root() / "repo-scope.json",
                     copilot_home() / "hooks" / "repo-scope.json")
    return ([Path(custom).expanduser()] if custom else []) + paths


def state_root() -> Path:
    rt = runtime_name()
    if rt == "codex":
        return codex_managed_root() / "state"
    if rt == "antigravity":
        return Path.home() / ".gemini" / "antigravity" / "state"
    return copilot_home() / "hooks" / "state"


def script_candidates(name: str) -> list[Path]:
    repo = Path(__file__).resolve().parents[2] / "scripts" / "global" / name
    codex = codex_managed_root() / "scripts" / name
    copilot = copilot_home() / "scripts" / name
    return [repo] + _ordered(codex, copilot)


def wiki_candidates() -> list[Path]:
    repo = Path(__file__).resolve().parents[2] / "wiki"
    extra = Path.home() / "devenv-ops" / "wiki"
    return _ordered(codex_managed_root() / "wiki", copilot_home() / "wiki") + [repo, extra]


def runtime_hook_paths() -> tuple[str, ...]:
    if runtime_name() == "antigravity":
        ag = str(Path.home() / ".gemini" / "antigravity" / "hooks" / "scripts")
        return (ag, str(copilot_home() / "hooks" / "scripts"))
    return (str(codex_managed_root() / "hooks"), str(copilot_home() / "hooks" / "scripts"))
