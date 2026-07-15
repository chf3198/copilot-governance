# Role Consultant Critique Rubric V2

Consultant closeouts must keep score computation separate from narrative review.

## Deterministic Rubric

Run:

```bash
node scripts/global/rubric-score.js \
  --trail /tmp/issue-trail.txt \
  --diff /tmp/pr.diff \
  --closeout /tmp/closeout-draft.md
```

Paste the JSON output under `### Deterministic Rubric`.

Inside that rubric block, subjective scoring phrases are forbidden. Do not write
phrases such as "because the test coverage is good" or "I think this deserves
9/10". The only score source is the `rubric-score.js` output.

## Rationale

Place narrative critique in a separate `### Rationale` section. Rationale can
explain risk, tradeoffs, and follow-up recommendations, but it does not change
`boxes_checked`, `boxes_total`, `score`, or `mean`.

Legacy `G1=9, G2=8, ...` closeouts remain accepted until 2026-05-22 for the
v1-to-v2 transition window.

---
Signed-by: Quill Mason
Team&Model: codex:gpt-5.4@openai
Role: collaborator
