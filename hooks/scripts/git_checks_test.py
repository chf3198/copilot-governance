#!/usr/bin/env python3
"""Regression tests for git_checks.detect_uncommitted_changes porcelain parsing (#3821).

Stdlib-only (unittest); hermetic — monkeypatches subprocess.run so no real git tree is needed. The bug:
`result.stdout.strip().split("\\n")` ate the leading status space of the FIRST porcelain line, shifting
its `line[3:]` and corrupting that path (".gitignore" -> "gitignore"), so the Stop session-attributable
delta (#3820) leaked exactly one item and false-blocked. The fix parses with `splitlines()` (no
whole-output strip), identical to session_baseline.snapshot_uncommitted.

Run: `python3 hooks/scripts/git_checks_test.py`.
"""
from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import git_checks  # noqa: E402


class _FakeResult:
    def __init__(self, stdout, returncode=0):
        self.stdout = stdout
        self.returncode = returncode
        self.stderr = ""


def _patched_run(stdout):
    """Return a subprocess.run stand-in that yields `stdout` regardless of args."""
    def _run(*_args, **_kwargs):
        return _FakeResult(stdout)
    return _run


# Real `git status --porcelain` output: XY + space + path. A modified file's X is a space, so the whole
# blob begins with a leading space that a naive .strip() would consume.
PORCELAIN = " M .gitignore\n?? scripts/new.js\n M hooks/scripts/a.py\n"


class FirstLineParse(unittest.TestCase):
    def setUp(self):
        self._orig = git_checks.subprocess.run

    def tearDown(self):
        git_checks.subprocess.run = self._orig

    def test_first_path_not_corrupted(self):
        git_checks.subprocess.run = _patched_run(PORCELAIN)
        out = git_checks.detect_uncommitted_changes("/nonexistent")
        # AC1: the FIRST entry keeps its leading dot — not "gitignore".
        self.assertEqual(out[0], ".gitignore")
        self.assertNotIn("gitignore", out, "the corrupted (dot-less) form must not appear")

    def test_all_paths_intact(self):
        git_checks.subprocess.run = _patched_run(PORCELAIN)
        out = git_checks.detect_uncommitted_changes("/nonexistent")
        self.assertEqual(out, [".gitignore", "scripts/new.js", "hooks/scripts/a.py"])

    def test_matches_snapshot_uncommitted_parsing(self):
        # AC2: detect_uncommitted_changes must parse identically to snapshot_uncommitted (both line[3:]
        # over splitlines()). Compare the two parse strategies over the same blob.
        import session_baseline as sb  # noqa: E402
        git_checks.subprocess.run = _patched_run(PORCELAIN)
        detect = git_checks.detect_uncommitted_changes("/nonexistent")
        sb_orig = sb.subprocess.run
        try:
            sb.subprocess.run = _patched_run(PORCELAIN)
            snap = sb.snapshot_uncommitted("/nonexistent")
        finally:
            sb.subprocess.run = sb_orig
        self.assertEqual(set(detect), set(snap))

    def test_empty_and_failure_safe(self):
        git_checks.subprocess.run = _patched_run("")
        self.assertEqual(git_checks.detect_uncommitted_changes("/x"), [])
        git_checks.subprocess.run = _patched_run(_FakeResult("x", returncode=1).stdout)  # noqa
        # returncode 1 path
        git_checks.subprocess.run = lambda *a, **k: _FakeResult("data", returncode=1)
        self.assertEqual(git_checks.detect_uncommitted_changes("/x"), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
