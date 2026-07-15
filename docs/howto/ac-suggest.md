# AI-suggested acceptance criteria — when to use it, and when to hand-write

> Delivers Epic **#1299** AC6. Tool: `scripts/ac-suggest.js` (+ `ac-suggest-cli.js` HITL surface,
> `ac-suggest-replay-eval.js` measurement). Backstop: `scripts/epic-ac-reconcile.js` (#1289).

## What it is

`ac-suggest` drafts 3–7 **measurable** acceptance criteria from a Manager's problem statement, then
runs each draft through the #1289 AC reconciler as a **measurability backstop**. It is a drafting
aid, not an oracle.

Per Microsoft Research 2026, *Intent Formalization: A Grand Challenge* — **"there is no oracle for
spec correctness; informal requirements must be validated by users."** The tool therefore validates
only that an AC is *measurable* (anchored to a concrete evidence source), never that it is the
*correct* requirement. The Manager remains the intent oracle: every suggestion is accepted, edited,
or rejected by a human via `ac-suggest-cli.js` (AC4).

## The measurability contract

An AC is **accepted** iff it anchors to one of the reconciler's evidence sources:

| Evidence source      | Anchor the classifier looks for            | Example                                   |
| -------------------- | ------------------------------------------ | ----------------------------------------- |
| `closed_child`       | a child issue reference `#N`               | "child #1289 is closed"                   |
| `file_existence`     | a file path with a known extension         | "scripts/ac-suggest.js exists"            |
| `sensor_output`      | a **numeric** metric/threshold             | "FP-rate is under 5%", "p95 < 200 ms"     |
| `native_github_api`  | observable GitHub state                    | "the PR is merged", "labeled status:done" |

Aspirational phrasing with no anchor is **rejected**: *improve*, *better*, *robust*, *elegant*, or a
metric word with **no number** ("improve latency"). This honest-negative behavior is the whole point
— it stops the tool from laundering vague intent into false confidence.

## When to USE AI suggestion

- **Greenfield Epics** where you want a fast, consistent first draft of 3–7 measurable ACs.
- **Normalizing AC quality** across Epics (the #1299 problem: some Epics had 3 ACs, some 13; some
  measurable, some aspirational).
- **Catching aspirational drift** in ACs you already drafted — paste them in; the backstop flags the
  unmeasurable ones for you to sharpen or drop.
- When a **free fleet / free-cloud** lane is reachable (G3): suggestion runs on `free-cloud-dispatch.js`,
  never a paid provider. If no lane answers, a deterministic offline fallback keeps it useful (G6).

## When to HAND-WRITE instead

- **The requirement is inherently un-measurable at draft time** (UX quality, "feels right",
  research questions). Forcing a measurable proxy would misrepresent intent — write it by hand and
  label it a `MEASURING`/research AC.
- **Irreversible, security-weakening, or carve-out work** — the four retained human carve-outs. AC
  suggestion is advisory; these need the Manager's own words.
- **Epic-level narrative ACs** ("Phase-0 R&D gate complete") that are satisfied by process, not by a
  single evidence anchor — the backstop will (correctly) not recognize them; don't fight it.
- When the reconciler is **unavailable or unstable** — without a live backstop, an AI draft is an
  ungated suggestion; hand-write until the backstop is green.

## Rule of thumb

> Use AI suggestion to **draft and to audit measurability**; use your own judgment to decide **what
> the Epic actually means**. The tool narrows aspirational ACs; it never validates intent.

## Verifying the tool itself

```bash
node scripts/ac-suggest.spec.js            # sibling spec (#1893) — public API + invariants
node scripts/ac-suggest-replay-eval.js     # AC5 measurement: FP-rate must be < 0.05 on the corpus
node scripts/ac-suggest-cli.js --json "your problem statement here"   # HITL / agent surface (AC4)
```

The corpus lives at `tests/fixtures/ac-suggest-corpus.json` and is the regression baseline for the
`<5%` false-positive bar (AC5). Add labeled samples there when you find a phrasing the classifier
mis-handles.

## References

- Epic #1299 (this deliverable) · Phase-0 #1302 · reconciler #1289 / Epic #1271
- [Microsoft Research 2026 — Intent Formalization](https://www.microsoft.com/en-us/research/publication/intent-formalization-a-grand-challenge-for-reliable-coding-in-the-age-of-ai-agents/)
- [Sayagh 2025 — GitHub Issue Readiness for AI Agents](https://arxiv.org/abs/2512.21426)
