#!/usr/bin/env node
// label-lint-status-cardinality (#1828 AC6) — enforces exactly one status:* label per ticket.
// Designed for unit-testability + invocation from .github/workflows/label-lint.yml.
'use strict';

const STATUS_PREFIX = 'status:';
const ADR_MARKER = '<!-- adr-010-status-cardinality -->';
const ADR_HEADING = '## ⚠️ ADR-010 Label Lint Violation (status cardinality)';
const RULE_REF = '**Rule 1 (Epic #1828 AC6)**: exactly one `status:*` label per ticket.';

function statusLabels(labels) {
  return (labels || [])
    .map(l => (typeof l === 'string' ? l : (l && l.name) || ''))
    .filter(n => n.startsWith(STATUS_PREFIX));
}

function evaluate(labels) {
  const found = statusLabels(labels);
  if (found.length === 0) {
    return { ok: false, rule: 'missing-status', detail: 'Ticket carries no status:* label. Apply exactly one.' };
  }
  if (found.length === 1) {
    return { ok: true, status: found[0] };
  }
  return {
    ok: false,
    rule: 'multi-status',
    detail: `Ticket carries ${found.length} status:* labels (${found.join(', ')}). Apply exactly one. Per Epic #1828 AC6.`,
    found,
  };
}

function violationComment(result, issueNumber) {
  if (result.ok) return null;
  if (result.rule === 'multi-status') {
    return `${ADR_MARKER}\n${ADR_HEADING}\n\nIssue #${issueNumber} carries multiple \`status:*\` labels:\n\n${result.found.map(s => `- \`${s}\``).join('\n')}\n\n${RULE_REF}\n\nResolution: Manager strips stale status labels; keep the one matching current workflow phase.`;
  }
  if (result.rule === 'missing-status') {
    return `${ADR_MARKER}\n${ADR_HEADING}\n\nIssue #${issueNumber} carries no \`status:*\` label.\n\n${RULE_REF}\n\nResolution: apply the appropriate status from the 11-state taxonomy.`;
  }
  return null;
}

// #1380: auto-strip helper — returns which labels to remove when a terminal
// status (done/cancelled) coexists with non-terminal ones (Rule 1 fix).
const TERMINAL_STATUSES = ['status:done', 'status:cancelled'];
function resolveTerminalConflict(labels) {
  const found = statusLabels(labels);
  if (found.length < 2) return { hasConflict: false };
  const terminal = found.find(l => TERMINAL_STATUSES.includes(l));
  if (!terminal) return { hasConflict: false };
  return {
    hasConflict: true,
    keepLabel: terminal,
    removeLabels: found.filter(l => l !== terminal),
  };
}

if (require.main === module) {
  // CLI: pass --labels "a,b,c" or read from stdin JSON.
  const idx = process.argv.indexOf('--labels');
  let labels = [];
  if (idx !== -1) {
    labels = process.argv[idx + 1].split(',').map(s => s.trim()).filter(Boolean);
  } else {
    try { labels = JSON.parse(require('fs').readFileSync(0, 'utf8')); } catch { labels = []; }
  }
  const result = evaluate(labels);
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (result.ok) {
    process.stdout.write(`✓ single status: ${result.status}\n`);
  } else {
    process.stderr.write(`✗ ${result.rule}: ${result.detail}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = { evaluate, statusLabels, violationComment, resolveTerminalConflict, TERMINAL_STATUSES, STATUS_PREFIX };
