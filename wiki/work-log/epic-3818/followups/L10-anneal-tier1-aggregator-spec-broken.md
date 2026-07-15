# Follow-up (Refs #3818, lot L10): anneal-tier1-aggregator.spec.js pre-existing failure

**Type:** follow-up defect · **Severity:** low (test-only; not run by CI) · **Filed by:** L10 capture
**Disposition:** captured faithfully as-is (byte-identical to canonical); NOT fixed inline (content-only rail).

## Symptom
`node scripts/anneal-tier1-aggregator.spec.js` throws:
```
Error: ENOENT: no such file or directory, open '/home/curtisfranks/tests/fixtures/anneal-tier1-sensors.json'
  at loadSensors (scripts/anneal-tier1-aggregator.js:20)  ← via run() ← testGoldenFixture (spec:19)
```

## Root cause (pre-existing, not a capture regression)
- The spec's golden-fixture test loads a **hardcoded absolute path** `~/tests/fixtures/anneal-tier1-sensors.json`.
- That fixture **does not exist anywhere**: not in `$HOME/tests/fixtures/`, not under `~/copilot-governance/`,
  and not tracked on `origin/main`.
- The spec **fails identically against the canonical checkout copy** (the source of truth), proving the
  defect predates and is independent of the #3818 capture. The captured file is `cmp`-clean vs canonical.
- Not executed by any CI job (CI runs only named validator specs — no generic `*.spec.js` runner), so it
  does not block merges.

## Recommended fix (separate ticket — do NOT bundle into a capture PR)
1. Add the missing fixture `tests/fixtures/anneal-tier1-sensors.json` (a golden input the spec expects), and/or
2. Change the spec to resolve the fixture **repo-relative** (e.g. `path.join(__dirname, '../tests/fixtures/...')`)
   instead of a hardcoded `$HOME`-absolute path, and skip gracefully when absent.
Either is a behavioral change and belongs in its own fix/<N> branch with its own review — out of scope for
the faithful #3818 capture.
