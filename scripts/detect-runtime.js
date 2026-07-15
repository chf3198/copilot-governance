#!/usr/bin/env node
'use strict';
// tier: 0
// detect-runtime (Epic #2659 / #2665): precedence-based detection of the ACTIVE agent
// runtime (the agent surface: claude-code / codex / copilot / antigravity / openclaw),
// distinct from the model family. Used to (a) auto-resolve HAMR_TEAM / the signer team
// when unset, and (b) attribute work to a runtime instead of guessing from process names.
//
// CRITICAL: `COPILOT_OTEL_*` env vars are injected into EVERY workspace terminal by the
// Copilot VS Code extension — they are present even in a Claude Code session. They are
// NOT evidence of a copilot RUNTIME and are deliberately ignored here.

const KNOWN = ['claude-code', 'codex', 'copilot', 'antigravity', 'cursor', 'openclaw'];

// Definitive per-runtime primary markers (NOT the workspace-injected COPILOT_OTEL_*).
const PRIMARY = [
  { runtime: 'claude-code', test: (env) => env.CLAUDECODE === '1' || Boolean(env.CLAUDE_CODE_ENTRYPOINT), signal: 'CLAUDECODE/CLAUDE_CODE_ENTRYPOINT' },
  { runtime: 'codex', test: (env) => Boolean(env.CODEX_HOME || env.CODEX_SANDBOX || env.CODEX_CLI), signal: 'CODEX_*' },
  { runtime: 'antigravity', test: (env) => Boolean(env.ANTIGRAVITY_AGENT || env.ANTIGRAVITY_HOME), signal: 'ANTIGRAVITY_*' },
  { runtime: 'cursor', test: (env) => Boolean(env.CURSOR_AGENT || env.CURSOR_TRACE_ID || env.CURSOR_WORKSPACE), signal: 'CURSOR_*' },
  { runtime: 'openclaw', test: (env) => Boolean(env.OPENCLAW_AGENT || env.OPENCLAW_HOME), signal: 'OPENCLAW_*' },
];

// detectRuntime(env) → { runtime, confidence, signal }.
// Order: the AI_AGENT=<runtime>_<version> convention (highest), then per-runtime primaries.
function detectRuntime(env = process.env) {
  const aiAgent = String(env.AI_AGENT || '').toLowerCase();
  for (const runtime of KNOWN) {
    if (aiAgent === runtime || aiAgent.startsWith(`${runtime}_`) || aiAgent.startsWith(`${runtime}-`)) {
      return { runtime, confidence: 'high', signal: `AI_AGENT=${runtime}*` };
    }
  }
  for (const candidate of PRIMARY) {
    if (candidate.test(env)) return { runtime: candidate.runtime, confidence: 'high', signal: candidate.signal };
  }
  return {
    runtime: 'unknown', confidence: 'none',
    signal: 'no primary runtime marker (COPILOT_OTEL_* ignored — workspace-injected, not a runtime signal)',
  };
}

if (require.main === module) {
  console.log(JSON.stringify(detectRuntime()));
}

module.exports = { detectRuntime, KNOWN };
