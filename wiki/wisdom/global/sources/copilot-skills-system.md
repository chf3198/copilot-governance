---
title: "Copilot Skills System"
type: source
created: 2026-04-14
updated: 2026-04-14
tags: []
sources: [raw/articles/copilot-skills-system.md]
related: []
status: draft
---

# Copilot Skills System

## Summary

Summary:
The Copilot Skills System is a collection of 33 skills deployed from devenv-ops to the user's .copilot/skills/ directory, each represented by an SKILL.md file with structured instructions. The system categorizes these skills into six categories: Role Baton, GitHub Ops, Fleet Routing, Repo Standards, Specialized, and others. Skills are Markdown files containing domain-specific knowledge that the agent loads on demand via file reads, never modifying each other.

Main Entities:
1. Copilot Skills System
2. devenv-ops (development source)
3. .copilot/skills/ directory
4. Agent
5. Manager, Collaborator, Admin, Consultant (Roles)
6. GitHub
7. Task Router, OpenClaw, Network Platforms (Tools)
8. Playwright Vision, Mem Watchdog, Secret Prevention (Specialized Tools)

Main Concepts:
1. Skills as structured instructions for the Copilot system
2. On-demand loading of skills via file reads
3. Non-modification of skills by each other
4. Composition of skills through the baton workflow
5. Deployment flow: editing, testing, merging, and applying skills

No claims that contradict existing knowledge were found in the provided source.

*Source: raw/articles/copilot-skills-system.md*