# Collaborator Validation — #3800

- **Role**: Collaborator | **Branch**: `feat/3800-epic-child-baton-traceability`
- **Signed-by**: Curtis Franks | **Team&Model**: claude-code:opus-4.8@anthropic | 2026-07-14

## Delivered (per Manager scope)

| AC  | Change | Evidence |
|-----|--------|----------|
| AC1 | Pre-existing detector `scripts/epic-child-baton-traceability.js` (pure `auditEpics()` + advisory CLI) retained. | hermetic spec 9/9 |
| AC2 | Wired advisory into `scripts/governance-verify.js` (default-on, `EPIC_CHILD_BATON_ADVISORY=0` kill-switch, try/catch, never adds to `issues`). | verdict-unchanged proof |
| AC6 | `docs/howto/epic-child-baton-traceability.md`. | committed 444bf88 |
| — | Spec: +wiring-contract regression (exports `{auditEpics,scanMirror}`, no-throw on missing dir). | 9/9 |
| — | `3800.md` flat-layout path drift corrected (`scripts/global/…` → `scripts/…`). | committed |

## Hermetic evidence (clean, `.git`-less archive; node built-ins only)

```
$ git archive feat/3800-epic-child-baton-traceability | tar -x -C /tmp/ci-3800
$ cd /tmp/ci-3800 && node scripts/epic-child-baton-traceability.spec.js
  … 9 passed, 0 failed        (SPEC_EXIT=0)
$ node scripts/governance-verify.js >/dev/null; echo $?              → 1
$ EPIC_CHILD_BATON_ADVISORY=0 node scripts/governance-verify.js >/dev/null; echo $? → 1
  exit_default == exit_killswitch  ⇒ advisory NEVER changes the pass/fail verdict
  .git_count=0                     ⇒ tree is genuinely hermetic
```

(The `governance-verify` exit=1 in the archive is a pre-existing artifact of its two-levels-up root
resolution landing on `/tmp` — missing `lint.yml`/`branch-name.yml` there. It is independent of this
change: the advisory try/catch does not throw, and the kill-switch parity proves the verdict is
untouched by the new section.)

## Gate results

- G-hermetic: **PASS** (9/9 on clean tree).
- G-wire: **PASS** (require never throws; verdict driven only by `issues`; kill-switch silences).
- G-consensus: **PASS** — receipt `dfb39ecb93c72857` (families: meta/groq + mistral).

Handoff → Admin.
