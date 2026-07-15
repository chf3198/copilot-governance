#!/usr/bin/env python3
"""Unit tests for session_baseline (#3810) — the session-attributable uncommitted gate.

Stdlib-only (unittest); imports ONLY session_baseline so it runs in isolation (no dependency on the
other hook modules or a real git tree). Run: `python3 hooks/scripts/session_baseline_test.py`.

Covers the manager scope acceptance criteria at the decision level:
  AC1  baseline == standing drift  -> should_block False (pre-existing files do NOT block)
  AC2  new post-SessionStart file  -> should_block True  (delta blocks; no weakening)
  AC3  baseline_drift_override     -> should_block False (parity with check_admin_ops #3054)
  AC4  branch-change / missing snapshot -> resolve_baseline None -> LEGACY full-set block (fail-safe)
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import session_baseline as sb  # noqa: E402

COLLAB = {"collaborator": True}

# The parked feat/3026 standing drift, abbreviated: pre-existing uncommitted code files.
STANDING_DRIFT = ["scripts/a.py", "hooks/scripts/b.js", "docs/c.md", "notes.txt"]


def record(branch, paths):
    return sb.build_baseline_record(branch, paths)


class AC1BaselineEqualsDrift(unittest.TestCase):
    def test_no_block_when_uncommitted_all_in_baseline(self):
        rec = record("feat/3026", STANDING_DRIFT)
        block, code = sb.should_block(
            list(STANDING_DRIFT), COLLAB, rec, current_branch="feat/3026", admin_ops={})
        self.assertFalse(block, "pre-existing baseline drift must NOT block")
        self.assertEqual(code, [])

    def test_no_block_even_though_drift_contains_code_files(self):
        # Sanity: the drift DOES contain .py/.js/.md — the old gate blocked on these.
        rec = record("feat/3026", STANDING_DRIFT)
        legacy_block, _ = sb.should_block(
            list(STANDING_DRIFT), COLLAB, None, current_branch="feat/3026", admin_ops={})
        self.assertTrue(legacy_block, "legacy/no-baseline path DOES block on the same set")
        new_block, _ = sb.should_block(
            list(STANDING_DRIFT), COLLAB, rec, current_branch="feat/3026", admin_ops={})
        self.assertFalse(new_block, "with matching baseline the identical set is suppressed")


class AC2NewFileStillBlocks(unittest.TestCase):
    def test_new_code_file_after_snapshot_blocks(self):
        rec = record("feat/3026", STANDING_DRIFT)
        uncommitted = STANDING_DRIFT + ["hooks/scripts/session_baseline.py"]  # session-authored
        block, code = sb.should_block(
            uncommitted, COLLAB, rec, current_branch="feat/3026", admin_ops={})
        self.assertTrue(block, "a NEW post-SessionStart uncommitted code file MUST still block")
        self.assertEqual(code, ["hooks/scripts/session_baseline.py"])

    def test_new_noncode_file_does_not_block(self):
        rec = record("feat/3026", STANDING_DRIFT)
        uncommitted = STANDING_DRIFT + ["scratch/output.log"]  # not a CODE ext
        block, code = sb.should_block(
            uncommitted, COLLAB, rec, current_branch="feat/3026", admin_ops={})
        self.assertFalse(block)
        self.assertEqual(code, [])

    def test_new_claude_managed_file_excluded(self):
        rec = record("feat/3026", STANDING_DRIFT)
        uncommitted = STANDING_DRIFT + [".claude/settings.json"]  # harness-managed (#1960)
        block, _ = sb.should_block(
            uncommitted, COLLAB, rec, current_branch="feat/3026", admin_ops={})
        self.assertFalse(block, ".claude/ paths are excluded from the block")


class AC3OverrideParity(unittest.TestCase):
    def test_baseline_drift_override_suppresses(self):
        uncommitted = STANDING_DRIFT + ["new.py"]  # even a genuine delta
        block, _ = sb.should_block(
            uncommitted, COLLAB, None, current_branch="feat/3026",
            admin_ops={"baseline_drift_override": True})
        self.assertFalse(block, "baseline_drift_override must suppress the block (#3054 parity)")

    def test_merge_evidence_override_suppresses(self):
        block, _ = sb.should_block(
            ["new.py"], COLLAB, None, current_branch="b",
            admin_ops={"merge_evidence_override": True})
        self.assertFalse(block)

    def test_is_override_helper(self):
        self.assertTrue(sb.is_override({"baseline_drift_override": True}))
        self.assertTrue(sb.is_override({"merge_evidence_override": 1}))
        self.assertFalse(sb.is_override({"baseline_drift_override": False}))
        self.assertFalse(sb.is_override({}))
        self.assertFalse(sb.is_override(None))


class AC4BranchChangeAndFailSafe(unittest.TestCase):
    def test_branch_change_resets_baseline(self):
        rec = record("feat/3026", STANDING_DRIFT)
        # Same uncommitted set but we are now on a DIFFERENT branch -> baseline not trusted.
        block, code = sb.should_block(
            list(STANDING_DRIFT), COLLAB, rec, current_branch="feat/other", admin_ops={})
        self.assertTrue(block, "a snapshot from another branch must NOT suppress (branch reset)")
        self.assertTrue(len(code) > 0)

    def test_missing_snapshot_legacy_block(self):
        block, _ = sb.should_block(
            list(STANDING_DRIFT), COLLAB, None, current_branch="feat/3026", admin_ops={})
        self.assertTrue(block, "missing snapshot => legacy full-set block (fail-safe, never fail-open)")

    def test_malformed_snapshot_legacy_block(self):
        for bad in ({"branch": "feat/3026"}, {"paths": "notalist"}, "string", 42, []):
            block, _ = sb.should_block(
                list(STANDING_DRIFT), COLLAB, bad, current_branch="feat/3026", admin_ops={})
            self.assertTrue(block, f"malformed record {bad!r} => fail-safe legacy block")

    def test_resolve_baseline_semantics(self):
        rec = record("b", ["x.py"])
        self.assertEqual(sb.resolve_baseline(rec, "b"), ["x.py"])   # match
        self.assertIsNone(sb.resolve_baseline(rec, "c"))            # branch mismatch
        self.assertIsNone(sb.resolve_baseline(rec, None))           # unknown current branch
        self.assertIsNone(sb.resolve_baseline(None, "b"))           # no record
        # clean-tree SessionStart: empty paths, matching branch -> [] (not None) -> nothing blocks
        self.assertEqual(sb.resolve_baseline(record("b", []), "b"), [])


class GuardConditions(unittest.TestCase):
    def test_empty_tree_no_block(self):
        block, _ = sb.should_block([], COLLAB, None, "b", {})
        self.assertFalse(block)

    def test_pre_collaborator_no_block(self):
        block, _ = sb.should_block(["new.py"], {"collaborator": False}, None, "b", {})
        self.assertFalse(block, "pre-collaborator phase is not an Admin gap (#1798)")

    def test_roles_none_still_evaluates(self):
        # roles=None (unknown) must not skip the gate.
        block, _ = sb.should_block(["new.py"], None, None, "b", {})
        self.assertTrue(block)

    def test_attributable_delta(self):
        self.assertEqual(sb.attributable_delta(["a", "b", "c"], ["b"]), ["a", "c"])
        self.assertEqual(sb.attributable_delta(["a"], ["a"]), [])


class SessionAttributableSubset(unittest.TestCase):
    """#3820 — the subset that scopes classify_internal_conflict to session-created conflicts."""

    def test_ac1_standing_drift_yields_empty(self):
        # All uncommitted paths are in the SessionStart baseline -> nothing attributable -> [] -> the
        # conflict classifier sees an empty list -> type "none" -> NO false-positive worktree-drift block.
        rec = record("feat/3026", STANDING_DRIFT)
        self.assertEqual(
            sb.session_attributable_subset(
                list(STANDING_DRIFT), rec, current_branch="feat/3026", admin_ops={}),
            [],
        )

    def test_ac2_new_conflict_still_surfaces(self):
        # A NEW file created after SessionStart is not in the baseline -> stays in the subset ->
        # still classified (no weakening of genuine conflict detection).
        rec = record("feat/3026", STANDING_DRIFT)
        out = sb.session_attributable_subset(
            list(STANDING_DRIFT) + ["scripts/new-conflict.js"], rec,
            current_branch="feat/3026", admin_ops={})
        self.assertEqual(out, ["scripts/new-conflict.js"])

    def test_ac3_override_suppresses(self):
        rec = record("feat/3026", STANDING_DRIFT)
        self.assertEqual(
            sb.session_attributable_subset(
                list(STANDING_DRIFT) + ["scripts/new.js"], rec,
                current_branch="feat/3026", admin_ops={"baseline_drift_override": True}),
            [],
        )

    def test_ac3_expected_mutations_ignored(self):
        # Ephemeral runtime files are never conflicts, even when session-attributable (not in baseline).
        rec = record("b", [])
        out = sb.session_attributable_subset(
            [".megingjord/session.id", "hooks/scripts/session_baseline.py",
             ".copilot/state.json", "scripts/real.js"],
            rec, current_branch="b", admin_ops={})
        self.assertEqual(out, ["scripts/real.js"])

    def test_ac4_unresolved_baseline_failsafe_full_set(self):
        # Missing/branch-mismatched baseline -> fall back to the FULL set (minus expected mutations),
        # so a real conflict on a checkout with no snapshot still classifies (fail-safe, not fail-open).
        out = sb.session_attributable_subset(
            ["scripts/x.js", "scripts/y.py"], None, current_branch="b", admin_ops={})
        self.assertEqual(out, ["scripts/x.js", "scripts/y.py"])
        # branch mismatch is also unresolved -> full set
        rec = record("other-branch", ["scripts/x.js"])
        out2 = sb.session_attributable_subset(
            ["scripts/x.js", "scripts/y.py"], rec, current_branch="b", admin_ops={})
        self.assertEqual(out2, ["scripts/x.js", "scripts/y.py"])

    def test_empty_tree_yields_empty(self):
        self.assertEqual(sb.session_attributable_subset([], None, "b", {}), [])

    def test_is_expected_mutation(self):
        self.assertTrue(sb.is_expected_mutation(".megingjord/session.id"))
        self.assertTrue(sb.is_expected_mutation("hooks/scripts/governance_state.json"))
        self.assertTrue(sb.is_expected_mutation(".copilot/anything"))
        self.assertFalse(sb.is_expected_mutation("scripts/real-validator.js"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
