# #3801 — 39-file baseline capture · ATTRIBUTION MANIFEST (AC2)

> Collaborator artifact. Faithful snapshot of the canonical checkout's live working-tree drift
> (`~/copilot-governance`, parked on `feat/3026`). Diff on `cleanup/3801-baseline-capture`:
> **39 files, +2159 / −607**, byte-identical to source (39/39 `cmp` clean). **No behavioral edits.**
>
> Attribution is **best-effort forensic** — ticket refs mined from added lines (`#NNNN`), themes from
> salient added content. Drift is genuinely multi-ticket (25+); `—` = no embedded ref, theme inferred.

## Subsystem A — Session hooks (runtime security-guard logic) · `hooks/scripts/*.py`  (+1114 net-heavy)

| File | Δ | Cited refs | Nature of change |
|------|----|-----------|------------------|
| `pretool_guard.py` | +793 | #3392, #3569, #2995 | Largest driver. Pre-tool baton/ticket/branch gate + session-anomaly + admin-pattern enforcement expansion. The running guard this whole roadmap keys off. |
| `stop_reminder.py` | ~+150 | #3569, #3749, #3266 | Stop-hook completeness/baton-incomplete messaging; session-cwd branch cleanliness checks. |
| `posttool_reminders.py` | ~+107 | — | PostToolUse governance/docs-hygiene reminders + context re-injection; shared-dir `sys.path` bootstrap. |
| `session_context.py` | ~+64 | — | SessionStart project-type adaptive governance context injection; `sys.path` bootstrap. |

## Subsystem B — Governance instructions · `instructions/*.md`  (largest doc block)

| File | Δ | Cited refs | Nature of change |
|------|----|-----------|------------------|
| `role-baton-routing.instructions.md` | +420 | #1828, #2148, #3532 | Baton lane routing / lightweight-lane + role-completion rules (aligns with #2263/#2345 lane reality). |
| `global-standards.instructions.md` | +115 | #2355, #2399, #3391 | Goal-lens G1-G10, operator-autonomy carve-out taxonomy, decision-check discipline. |
| `workflow-resilience.instructions.md` | ~+96 | #2116, #3380, #2113 | Tier-2 mid-flight anneal-emission model; goal-failure-escalation events. |
| `github-governance.instructions.md` | ~+55 | #2304, #2295, #1614 | GitHub ticket/PR governance gate wording. |
| `operator-identity-context.instructions.md` | ~+56 | #3714, #1889 | Operator identity/consensus-routing context (self-post closeout → consensus). |
| `release-docs-hygiene.instructions.md` | ~+26 | #999, #2148 | Release/docs hygiene cadence. |
| `repo-health-onboarding.instructions.md` | ~+17 | — | OpenSSF alignment (Dependabot/secret-scanning/scorecard); session-start profile skill. |
| `playwright-mcp-low-resource.instructions.md` | +2/−2 | — | Path normalization for preflight script. |

## Subsystem C — Skills bodies · `skills/*/SKILL.md`  (22 files)

| File | Δ | Cited refs | Nature of change |
|------|----|-----------|------------------|
| `github-ticket-lifecycle-orchestrator/SKILL.md` | ~184 | — | Baton/lifecycle phase-protocol evolution (largest skill Δ). |
| `workflow-self-anneal/SKILL.md` | ~136 | #1574, #1568 | Bounded self-anneal review procedure. |
| `operator-identity-context/SKILL.md` | ~85 | — | Operator-identity adapter refresh. |
| `role-consultant-critique/SKILL.md` | ~74 | — | Consultant critique/risk-scoring procedure. |
| `role-admin-execution/SKILL.md` | ~73 | #3053, #2578 | Admin merge/handoff execution steps. |
| `role-collaborator-execution/SKILL.md` | ~58 | #1571 | Collaborator evidence-gate procedure. |
| `role-manager-execution/SKILL.md` | ~52 | — | Manager scope/AC/gate definition procedure. |
| `docs-drift-maintenance/SKILL.md` | ~40 | #101 | Docs-drift detect/remediate procedure. |
| `role-baton-orchestrator/SKILL.md` | ~25 | — | Baton entry/exit contract orchestration. |
| `repo-onboarding-standards/SKILL.md` | ~21 | #2785 | Repo onboarding baseline. |
| `repo-standards-router/SKILL.md` | ~19 | — | App-type → standards-branch routing. |
| `github-actions-security-hardening/SKILL.md` | +11 | — | Least-privilege/pinning posture additions. |
| `mem-watchdog-ops/SKILL.md` | ~10 | — | Memory watchdog ops adapter. |
| `github-{ops-excellence,ops-tree-router,projects-agile-linkage,release-incident-flow,review-merge-admin}/SKILL.md` | ~4 each | — | GitHub-ops skill-tree cross-reference/routing touch-ups. |
| `{repo-profile-governance,playwright-vision-low-resource}/SKILL.md` | ~4 each | — | Adapter/path refresh. |
| `{release-version-integrity,secret-exposure-prevention}/SKILL.md` | +3 each | — | Additive guidance lines. |

## Subsystem D — Agent cards · `agents/*.md`  (4 files)

| File | Δ | Nature of change |
|------|----|------------------|
| `planner.agent.md` | ~10 | Model pin `Claude Opus 4.6 (copilot)` + prompt-action wiring (Implement/Architect). |
| `security-scanner.agent.md` | ~4 | Model pin `Sonnet 4.6` + secret-pattern list. |
| `governance-auditor.agent.md` | +2/−2 | Model pin normalization. |
| `release-reviewer.agent.md` | +2/−2 | Model pin normalization. |

## Subsystem E — Repo config · `.gitignore`  (+25)

| File | Cited refs | Nature of change |
|------|-----------|------------------|
| `.gitignore` | #3797 | Ignore rules from the baseline-restore era (session/HAMR/scratch artifacts). |

## Provenance / safety attestation

- Base = `origin/main` @ `5c898a7`. Verified this run that all 39 files are **disjoint** from the entire
  `feat/3026`-vs-`main` committed diff ⇒ `main` content == `feat/3026` content for these files ⇒ the
  branch diff is exactly the working-tree drift, nothing conflated.
- `reset --hard` was **rejected** as remediation (would revert running guards). Capture-as-baseline chosen.
- Untracked files (~724) deliberately **excluded** — documented-normal mirror state.

## Mode normalization (sole deviation from a raw copy — corrects a capture-tool artifact, not drift)

The initial `install`-based copy set 0755 on all 39 files. Verified against the canonical git index:
docs/config source mode is **100644**, only the 4 `hooks/scripts/*.py` are legitimately **100755**.
Modes were normalized to match the canonical index exactly ⇒ the committed diff is **content-only, no
mode changes** (`git diff --cached | grep -c 'new mode'` = 0). Content remains 39/39 `cmp`-clean.

## ⚠ Decision flagged for cross-family ratification (AC4) — `.gitignore` `wiki/` ignore

The captured `.gitignore` (faithful) adds `wiki/` to the ignore set with the rationale "Generated
LLM-wiki mirror (Karpathy-pattern, regenerated; never tracked)". This aligns with the ratified
mirror-cutover direction (Epic #3719 / `ticket-universe-is-local-mirror`). Consequence: the 18 wiki
files already tracked on `main` **stay tracked** (git does not untrack), but **new** baton artifacts
under `wiki/` must be `git add -f`'d. This capture force-adds its own baton artifacts accordingly. This
behavioral consequence is put to the cross-family panel rather than decided unilaterally; the
`.gitignore` also ignores runtime/generated state and host-local token files (`/config.json`, `/ide/`,
`/permissions-config.json`, #3797) — both unambiguously beneficial.
