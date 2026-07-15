# #3818 — Lot Manifest (disjoint, glob-defined work units)

Each lot is a slice of the canonical checkout's drift. Lots are **provably disjoint** (no glob overlaps
another) and **together total** (L12 is the catch-all = everything under `scripts/` not named above).
Compute a lot's exact file set with the command in its row, run against the canonical checkout
(`~/copilot-governance`).

> Counts are approximate (drift moves). The command is authoritative. `S` = `git -C ~/copilot-governance
> status --porcelain` (modified **and** untracked). Extract paths with `| cut -c4-`.

## The 12 lots

| Lot | Segment | ~files | Risk | File-set selector (paths from `S | cut -c4-`, filtered) |
|---|---|---|---|---|
| **L1** | hooks | 76 | 🔴 high | `^hooks/` |
| **L2** | instructions | 45 | 🟡 med | `^instructions/` |
| **L3** | skills | 39 | 🟡 med | `^skills/` |
| **L4** | agents | 10 | 🟢 low | `^agents/` |
| **L5** | root-misc | ~5 | 🟢 low | not `^(scripts|hooks|instructions|skills|agents)/` (`.gitignore`, `openclaw/`, `docs/`, `dashboard/`, `.changes/`) |
| **L6** | scripts · fleet + hamr | ~81 | 🟡 med | `^scripts/(fleet|hamr|openclaw)-` |
| **L7** | scripts · governance + lint | ~49 | 🔴 high | `^scripts/(governance|lint|label|friction)-` |
| **L8** | scripts · baton + epic + ticket | ~45 | 🔴 high | `^scripts/(baton|epic|ticket)-` |
| **L9** | scripts · cross-family + model + review | ~40 | 🔴 high | `^scripts/(cross|model|multi|review)-` |
| **L10** | scripts · anneal + harness | ~39 | 🟡 med | `^scripts/(anneal|harness)-` |
| **L11** | scripts · worktree + auth + routing | ~27 | 🟡 med | `^scripts/(worktree|authorization|routing)-` |
| **L12** | scripts · everything else | ~309 | 🟡 med | `^scripts/` AND NOT matched by L6–L11 (token, github, ide, test, tavily, stress, sensors/, …) — sub-shard by first letter (L12a a–m, L12b n–z) if too large |

### Compute your lot's files
```bash
S(){ git -C ~/copilot-governance status --porcelain | cut -c4-; }
# examples:
S | grep -E '^hooks/'                                             # L1
S | grep -E '^scripts/(governance|lint|label|friction)-'         # L7
S | grep -E '^scripts/' | grep -vE '^scripts/(fleet|hamr|openclaw|governance|lint|label|friction|baton|epic|ticket|cross|model|multi|review|anneal|harness|worktree|authorization|routing)-'   # L12
```

### Disjointness + coverage self-check (run before claiming; must pass)
```bash
# coverage: union of all lots == full drift (expect: equal counts, empty diff)
S | sort > /tmp/all.txt
{ S|grep -E '^hooks/'; S|grep -E '^instructions/'; S|grep -E '^skills/'; S|grep -E '^agents/';
  S|grep -vE '^(scripts|hooks|instructions|skills|agents)/';
  S|grep -E '^scripts/(fleet|hamr|openclaw|governance|lint|label|friction|baton|epic|ticket|cross|model|multi|review|anneal|harness|worktree|authorization|routing)-';
  S|grep -E '^scripts/'|grep -vE '^scripts/(fleet|hamr|openclaw|governance|lint|label|friction|baton|epic|ticket|cross|model|multi|review|anneal|harness|worktree|authorization|routing)-';
} | sort -u > /tmp/lots.txt
diff /tmp/all.txt /tmp/lots.txt && echo "COVERAGE OK (100%, disjoint)"
```

---

## Per-lot research topics (cutting-edge web pass before capturing)

Research **validates** the running logic is current-best and surfaces hold/discard candidates — it does
not authorize inline rewrites.

- **L1 hooks** — git hook security, fail-closed guard design, session/tool-call interception, secrets in
  hooks, supply-chain of local hooks. *(Highest risk: these are live security guards — extra scrutiny.)*
- **L2 instructions** — agent/LLM system-instruction best practice, governance-as-prose, prompt-injection
  resistance, instruction-file layering.
- **L3 skills** — agent skill/tool design, progressive disclosure, skill routing, capability scoping.
- **L4 agents** — sub-agent role design, least-privilege tool grants, reviewer/auditor agent patterns.
- **L5 root-misc** — `.gitignore` hygiene, repo config, dashboard/docs static assets.
- **L6 fleet + hamr** — fleet/model routing, local-model orchestration, GPU/CPU scheduling, HAMR activation.
- **L7 governance + lint** — policy-as-code, OPA/Gatekeeper enforcement modes, linter design, advisory→blocking rollout.
- **L8 baton + epic + ticket** — workflow state machines, ticket lifecycle automation, saga/handoff integrity.
- **L9 cross-family + model + review** — multi-model consensus, LLM-as-judge, adversarial review, ensemble reliability.
- **L10 anneal + harness** — self-healing/self-annealing systems, test harness design, regression prevention.
- **L11 worktree + auth + routing** — git worktree isolation, authorization/least-privilege, request routing.
- **L12 scripts-rest** — per-file: research the specific tool's domain (tokens, GitHub API, IDE, Tavily, stress-testing, sensors).

## Suggested claim order (highest leverage first)

1. **L1 hooks** — highest risk + unblocks the Stop-hook class fastest (fuel removal).
2. **L7/L8/L9** — high-risk governance/baton/consensus validators (the safety spine).
3. **L2/L3/L4** — instructions/skills/agents (broad but lower risk).
4. **L6/L10/L11** — medium scripts clusters.
5. **L12** — the long tail (sub-shard as needed).
6. **Final closeout child** — canonical-checkout clean cutover (#3801 AC4) + recurrence sentinel
   (#3801 AC5). Only after all capture lots merge. This one `Closes #3818` and #3801.
