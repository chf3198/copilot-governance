#!/usr/bin/env node
'use strict';
// tier: 1
// judgment-gate (Epic #2709 / #2723): fail-closed gates for the governance links that
// need a recorded operator JUDGMENT the system cannot synthesize. Rather than trust the
// operator to remember, the gate blocks forward progress until the judgment is recorded:
//   - flaw-recognition decision: a closeout/handoff that recognizes a flaw MUST carry an
//     explicit flaw_decision token (file-ticket | log-incident-only | memory-note-only |
//     no-action-justified) - the CLAUDE.md rule, now enforced not just requested.
//   - baton-entry: a tracked-file mutation with no active baton is a missing link.
// Pure logic (unit-testable); callers inject the live facts.

const FLAW_MENTION = /\b(flaw|defect|regression|incorrect|bug)\b/i;
const FLAW_DECISIONS = ['file-ticket', 'log-incident-only', 'memory-note-only', 'no-action-justified'];
const DECISION_RE = new RegExp(`\\b(?:${FLAW_DECISIONS.join('|')})\\b`, 'i');
const MUTATING_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

// True (block) when text recognizes a flaw but records no explicit flaw_decision token.
function flawDecisionMissing(text) {
  const body = String(text || '');
  if (!FLAW_MENTION.test(body)) return false;
  return !DECISION_RE.test(body);
}

// True (block) when a tracked-file mutation is attempted with no active baton/ticket.
function batonEntryRequired(toolName, hasActiveTicket) {
  return MUTATING_TOOLS.has(String(toolName || '')) && !hasActiveTicket;
}

function judgmentGateDecision(ctx = {}) {
  const violations = [];
  if (ctx.artifactText !== undefined && flawDecisionMissing(ctx.artifactText)) {
    violations.push({ rule: 'flaw-decision-missing',
      detail: `recognized a flaw but no flaw_decision recorded (one of: ${FLAW_DECISIONS.join(', ')})` });
  }
  if (ctx.toolName !== undefined && batonEntryRequired(ctx.toolName, Boolean(ctx.hasActiveTicket))) {
    violations.push({ rule: 'baton-entry-without-ticket',
      detail: `${ctx.toolName} mutates tracked state with no active baton - start the baton (link a ticket) first` });
  }
  return { ok: violations.length === 0, violations };
}

module.exports = { flawDecisionMissing, batonEntryRequired, judgmentGateDecision,
  FLAW_DECISIONS, MUTATING_TOOLS };
