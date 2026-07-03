---
title: "Prose-Doc Orphan Detection (whole-tree haystack)"
type: concept
created: 2026-06-28
updated: 2026-06-28
tags: [docs-governance, doc-coverage, orphan-detection, g8]
sources: ["#3298", "#3296", "#2708", "#3068"]
related: ["[[wiki-health-detector]]", "[[doc-update-trigger-matrix]]"]
status: stub
---

# Prose-Doc Orphan Detection (whole-tree haystack)

A reusable pattern, extracted while building `docs:health` (#3298), for finding
**orphan** documentation — prose docs that nothing in the repository references and
that the merge-time `doc-coverage` gate structurally cannot see (it only fires on
*changed* PRs, so an untouched orphan is invisible forever).

## The trap: link-graph-only orphan detection is too narrow

The intuitive implementation counts only formal markdown links (`](path.md)`) and
`[[wikilinks]]` between docs. In a governance harness that cites docs by **inline
path** everywhere — `CLAUDE.md`, `instructions/**`, and script comments routinely
write `docs/howto/foo.md` as bare text — that approach reported a **67% false-orphan
rate** (104 of 155 docs) on first run. Most "orphans" were in fact referenced, just
not via a formal link.

## The fix: scan the whole tracked-file tree as one haystack

A doc is *referenced* if **any other file** (`.md`, `.js`, `.yml`, `.json`, `.ts`,
`.py` under docs/instructions/governance/scripts/hooks/.github/wiki + root) mentions
its repo-relative path as a literal substring, or carries a `[[basename]]` wikilink to
it. Self-mention (a file citing only its own path, e.g. frontmatter `source_path`) is
excluded. This dropped the false-orphan rate to a credible, actionable set (7 genuine
orphans). The substring scan over a few-MB concatenated corpus is O(docs × files) but
trivially cheap on a real repo.

## Companion: the freshness/owner half

Orphan detection is the *structural* (non-calendar) signal. The *currency* signal is
per-surface staleness, computed against a `freshness_window` declared in an
ownership map (`config/doc-health-owners.yml`). That window is a **content** property
(it mirrors the wiki frontmatter `freshness_window` contract), not a process-promotion
calendar threshold — the advisory→blocking promotion of the scan stays replay-eval-gated.

## Scope boundary (do not reopen the seam)

Apply this to **prose** only. Prompt artifacts (`skills/**/SKILL.md`, `agents/**`,
`.claude/commands/*.md`) are eval-harness artifacts; their git edit-date is not a
doc-rot signal and their structural quality is governed separately (#3302).
