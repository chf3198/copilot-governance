# #3823 — Validation (baseline-cutover mode-awareness)

**Branch:** fix/3823-cutover-mode-aware · **Base:** origin/main
**Files:** scripts/baseline-cutover.js (divergence oracle), .spec.js, .spec.md.

## Result
- node --check clean; spec 7/7; self-test PASS; governance-verify PASS; validator-discipline OK + AC7 self-test OK.
- enforcement-wiring-audit 43/562 ENFORCED. Content-only changeset.
- Cross-family consensus PASS -- receipt bfbd947c49504c05 (meta+mistral).

## The defect fixed
baseline-cutover (ticket-3822) reported ready=true on a CONTENT-ONLY cmp; the real reset --mixed showed
837 mode-diffs + 214 origin-ahead it missed. New divergence() uses a TEMP INDEX (read-tree origin/main)
+ git diff --raw --abbrev=40 -z + batched hash-object to distinguish mode-only vs content vs origin-ahead.
Two dev bugs fixed: raw reports working sha as 0000000 (hash-object the working copy instead); raw
abbreviates origin sha (--abbrev=40 for full). Never mutates the live checkout (temp index in os.tmpdir).

## Truthful dry-run vs REAL canonical (validates the fix)
837 modeDrift (100755->100644) + 214 originAhead + 11 untracked + 9 content-divergences + 1 hold
(governance-verify.js). Previously falsely "876 safe, ready".

## AC status
AC1 [x] AC2 [x] AC3 [x] AC4 [x] AC5 [x] AC6 [x] (bfbd947c49504c05)
