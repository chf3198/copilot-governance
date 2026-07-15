# Corpus over-flag audit — #3805 (AC2 proof)

`mirror-ticket-lint` run against the full live wiki-mirror corpus
(`~/copilot-governance/wiki/work-log/tickets/*.md`) on 2026-07-14.

## Result

| metric | value |
|---|---|
| tickets scanned / checked | 1182 |
| total advisory warnings | 15 |
| **aggregate warn rate** | **1.27 %** (budget: < 2 %) ✅ |

### By invariant

| code | count | notes |
|---|---:|---|
| MTL1 `number_mismatch` | 0 | title `#N` matches filename everywhere (clean integrity) |
| MTL2 `missing_status` | 0 | every ticket carries a `status:` frontmatter field |
| MTL3 `malformed_priority` | 15 | Labels line present but no `priority:P[0-3]` |
| MTL4 `placeholder_signature` | 0 | no un-backfilled `PLACEHOLDER_SIGNATURE` |

## False-positive check

All 15 MTL3 hits are **true positives**, spot-verified — e.g.:

- `1381.md` → `Labels: type:epic, area:governance, status:cancelled` (no priority)
- `2015.md` → `Labels: type:task, status:done, area:governance, lane:docs-research` (no priority)
- `1386.md` → `Labels: type:task, area:governance, status:cancelled` (no priority)

A well-formed ticket (`2064.md`) carries `priority:P3` and does not warn. No spurious flags observed.

## Conclusion

The reconciled parser lints the real flat corpus (previously `checkedTickets: 0`, a silent no-op) at a
1.27 % advisory warn rate — comfortably under the 2 % promote-threshold precedent (`accountable-team`).
The four invariants are schema-appropriate and low-FP; MTL1/MTL2/MTL4 do not fire spuriously, MTL3
surfaces 15 genuine missing-priority tickets. No over-flagging. Advisory-first; promotion to a hard
block deferred to a post-soak decision (§3g).
