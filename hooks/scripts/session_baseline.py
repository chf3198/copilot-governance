#!/usr/bin/env python3
"""Session-attributable uncommitted-baseline helpers (#3810).

The Stop hook's uncommitted-code gate (`stop_checks.check_uncommitted`) used to block on ANY
uncommitted code file once `roles['collaborator']` was True, with no attribution to whether the
CURRENT session authored the file. On the parked `feat/3026` canonical checkout — which carries
standing multi-ticket baseline drift (~40 modified + ~724 untracked, intentionally uncommitted per
#3801) — that produced a permanent false-positive "Stop blocked: uncommitted changes" (same disease
already cured for `detect_session_signals` under #2005).

This module makes the gate fire only on **session-attributable** uncommitted code: code NOT present
in the baseline snapshot taken at SessionStart. It is pure/stdlib-only (no dependency on the other
hook modules) so it is unit-testable in isolation and safe to import from both the SessionStart
(`session_context.py`) and Stop (`stop_checks.py` via `stop_reminder.py`) paths.

Design (manager scope #3810):
  * SessionStart snapshots `git status --porcelain` paths + the branch into `governance_state`
    (`state["baseline_uncommitted"] = {"branch": <branch>, "paths": [...]}`).
  * Stop blocks only on the DELTA vs that baseline (`attributable_delta`).
  * Branch change resets the baseline implicitly: `resolve_baseline` returns None when the stored
    branch != the current branch, so a stale snapshot is never trusted (fail-safe, not fail-open).
  * Override parity with `check_admin_ops` (#3054): an explicit `baseline_drift_override` /
    `merge_evidence_override` in admin_ops suppresses the block.

FAIL-SAFE DIRECTION (never fail-open): whenever the baseline cannot be resolved — missing,
malformed, unreadable, or captured on a different branch — the gate falls back to LEGACY behavior
(evaluate the full uncommitted set), so a genuine session gap is never hidden. AC2 is preserved: a
NEW post-SessionStart uncommitted code file is not in the baseline, lands in the delta, and STILL
blocks.
"""
from __future__ import annotations

import subprocess
from typing import Iterable, Optional

# Mirror of stop_checks.CODE_UNCOMMITTED_EXTS — kept here so the block decision is fully evaluable
# from this module (single source of the gate logic for testability). Must stay in sync.
CODE_UNCOMMITTED_EXTS = (".sh", ".js", ".py", ".ts", ".json", ".md")

# admin_ops keys that constitute a documented baseline-drift override — parity with
# stop_checks.MERGE_EXCEPTION_KEYS / check_admin_ops (#3054).
OVERRIDE_KEYS = ("baseline_drift_override", "merge_evidence_override")


def snapshot_uncommitted(cwd: str) -> Optional[list[str]]:
    """Return the sorted set of uncommitted working-tree paths at `cwd`, or None on failure.

    None (not []) on failure is deliberate: a failed snapshot must NOT be recorded as an empty
    baseline (which would fail-open by making every real file look session-new... it would actually
    over-block, but more importantly an unreadable git tree should leave NO baseline so the Stop
    path falls back to legacy). Callers should only persist a non-None result.
    """
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, cwd=cwd, timeout=5,
        )
    except Exception:
        return None
    if result.returncode != 0:
        return None
    paths = [line[3:] for line in result.stdout.splitlines() if line.strip()]
    return sorted(set(paths))


def build_baseline_record(branch: Optional[str], paths: Iterable[str]) -> dict:
    """Build the persisted baseline record: the branch it was captured on + the path set."""
    return {"branch": branch, "paths": sorted(set(str(p) for p in paths))}


def resolve_baseline(record: object, current_branch: Optional[str]) -> Optional[list[str]]:
    """Return the baseline path list to subtract, or None to force LEGACY (fail-safe) evaluation.

    None is returned when the record is missing/malformed OR was captured on a different branch than
    `current_branch` (branch-change reset, AC4). A well-formed record whose branch matches yields its
    path list (possibly empty — a clean-tree SessionStart).
    """
    if not isinstance(record, dict):
        return None
    paths = record.get("paths")
    if not isinstance(paths, list):
        return None
    # Branch-change reset: a snapshot from another branch is not trustworthy for this branch.
    # current_branch is compared to the recorded branch; if either is None we cannot confirm a
    # match, so fail-safe to legacy.
    rec_branch = record.get("branch")
    if current_branch is None or rec_branch is None or rec_branch != current_branch:
        return None
    return [str(p) for p in paths]


def is_override(admin_ops: object) -> bool:
    """True when a documented baseline-drift override is recorded in admin_ops (#3054 parity)."""
    if not isinstance(admin_ops, dict):
        return False
    return any(admin_ops.get(k) for k in OVERRIDE_KEYS)


def attributable_delta(uncommitted: Iterable[str], baseline: Iterable[str]) -> list[str]:
    """Uncommitted paths NOT present in the baseline snapshot (order-preserving)."""
    base = set(str(p) for p in baseline)
    return [f for f in uncommitted if f not in base]


# Expected-mutation allowlist (#3820): ephemeral runtime files that legitimately churn every session
# and must NEVER be treated as drift or as an internal conflict — the GitOps "ignore expected
# mutations" / helm-diff "ignore auto-added annotations" pattern. Prefix- or substring-matched against
# `git status --porcelain` paths.
EXPECTED_MUTATION_PREFIXES = (
    ".megingjord/",
    ".copilot/",
    ".claude/",
)
EXPECTED_MUTATION_SUBSTRINGS = (
    "session.id",
    "session_baseline",
    "governance_state",
    "state_store",
    "runtime_session",
    "tool_activity",
    "incidents.log",
    "friction-events",
)


def is_expected_mutation(path: str) -> bool:
    """True for ephemeral runtime files that legitimately churn and must be ignored by drift/conflict
    classification (parity with GitOps exclusion lists / helm-diff annotation ignores)."""
    p = str(path)
    if any(p.startswith(pre) for pre in EXPECTED_MUTATION_PREFIXES):
        return True
    return any(s in p for s in EXPECTED_MUTATION_SUBSTRINGS)


def session_attributable_subset(
    uncommitted: Iterable[str],
    baseline_record: object = None,
    current_branch: Optional[str] = None,
    admin_ops: object = None,
) -> list[str]:
    """The subset of `uncommitted` THIS session is accountable for — used to SCOPE internal-conflict
    classification (#3820) so the `worktree-drift` catch-all in `classify_internal_conflict` never
    fires on standing baseline drift (#3801). Reuses the #3810 baseline substrate:

      * Empty tree                       -> [] (nothing to classify).
      * Documented override (#3054)      -> [] (suppress; parity with should_block).
      * Baseline resolves                -> attributable delta (uncommitted - baseline).
      * Baseline unresolved (fail-safe)  -> FULL set (LEGACY); a real session conflict still classifies.

    Expected-mutation ephemeral files are always removed (they are not conflicts). Order-preserving.
    """
    items = [str(f) for f in (uncommitted or []) if str(f).strip()]
    if not items:
        return []
    if is_override(admin_ops):
        return []
    baseline = resolve_baseline(baseline_record, current_branch)
    candidates = items if baseline is None else attributable_delta(items, baseline)
    return [f for f in candidates if not is_expected_mutation(f)]


def _code_files(candidates: Iterable[str]) -> list[str]:
    """Filter to code files subject to the Admin gate, excluding harness-managed .claude/ (#1960)."""
    return [
        f for f in candidates
        if any(f.endswith(e) for e in CODE_UNCOMMITTED_EXTS)
        and not f.startswith(".claude/")
    ]


def should_block(
    uncommitted: list[str],
    roles: Optional[dict],
    baseline_record: object = None,
    current_branch: Optional[str] = None,
    admin_ops: object = None,
) -> tuple[bool, list[str]]:
    """Decide whether the Stop uncommitted-code gate should block, session-attributably.

    Returns (block, code_files). `code_files` is the session-attributable code set that justifies
    the block (empty when not blocking). This is the single source of truth for the gate; the
    message formatting stays in stop_checks.check_uncommitted.

    Order of precedence (matches manager scope #3810):
      1. Empty tree                       -> no block.
      2. Pre-collaborator phase (#1798)   -> no block (in-progress/unrelated, not an Admin gap).
      3. Documented override (#3054)      -> no block (baseline_drift/merge_evidence override).
      4. Baseline resolves                -> block only on the DELTA (session-attributable). AC1/AC2.
      5. Baseline unresolved (fail-safe)  -> block on the FULL set (LEGACY). AC4 missing-snapshot.
    """
    if not uncommitted:
        return False, []
    if roles is not None and not roles.get("collaborator", False):
        return False, []
    if is_override(admin_ops):
        return False, []
    baseline = resolve_baseline(baseline_record, current_branch)
    candidates = uncommitted if baseline is None else attributable_delta(uncommitted, baseline)
    code_files = _code_files(candidates)
    return (bool(code_files), code_files)
