---
title: "Matrix refresh automation 2026-05-03"
type: source
created: 2026-05-03
updated: 2026-05-03
tags: [model-routing, matrix, refresh, freshness, fleet]
sources: ["[[ticket-audit-2026-05-02]]"]
related: ["[[ticket-audit-pattern]]", "[[free-router]]", "[[cascade-dispatch]]", "[[fleet-architecture]]"]
status: draft
---

# Matrix refresh automation 2026-05-03

## Summary

`#833` shipped the missing automation around the fleet model evaluation matrix:

- `npm run routing:refresh` probes Groq, Cerebras, OpenRouter, Google AI Studio, and the three Tailscale Ollama hosts (36gbwinresource, windows-laptop, penguin-1); writes `.dashboard/routing-snapshot.json` and stamps the matrix's `Last refreshed:` header.
- `npm run routing:freshness` fails CI when the header is more than 60 days old.
- Monthly CI workflow (`model-matrix-refresh.yml`) runs the freshness gate on schedule and on PR.

## Live state captured (2026-05-03)

| Provider | Models | Notes |
|---|---|---|
| Groq | 16 | llama-3.3-70b-versatile, qwen3-32b, gpt-oss-120b, llama-4-scout |
| Cerebras | 4 | qwen-3-235b-a22b-instruct-2507, gpt-oss-120b, llama3.1-8b, zai-glm-4.7 |
| OpenRouter | 371 | broad free pool incl. nemotron-3-nano, poolside laguna |
| Google AI Studio | 50 | gemini-2.5-flash live; 2.0 deprecated (per #804) |
| 36gbwinresource | 5 | qwen2.5-coder:32b, starcoder2:3b, granite-code:3b |
| windows-laptop | 7 | deepseek-coder-v2:lite, granite-code:20b |
| penguin-1 | 4 | qwen3:0.6b, embedders |

## Fleet usage during the work

36gbwinresource (`qwen2.5-coder:32b`) drafted the matrix change-summary; Groq + Cerebras + OpenRouter + Google AI Studio supplied the live snapshot. Zero paid LLM tokens consumed for content.

*Source: PR feat/833-matrix-refresh-automation*

See: [[ticket-audit-pattern]], [[free-router]], [[cascade-dispatch]]
