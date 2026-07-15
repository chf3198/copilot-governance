#!/usr/bin/env node
// collab-handoff-rebase-freshness (#1827 AC5) — validator for COLLABORATOR_HANDOFF
// schema extension. Checks behind_at_handoff + rebase_freshness fields.
// Bridge mode: emits advisory when absent (NOT a hard fail); promotion gated on replay-eval.
'use strict';

const BEHIND_FIELD_RE = /\bbehind_at_handoff\s*[:=]\s*(\d+)/i;
const FRESHNESS_FIELD_RE = /\brebase_freshness\s*[:=]\s*([0-9T:.\-Z]+)/i;
const MAX_BEHIND_AT_HANDOFF = 30;
const MAX_FRESHNESS_AGE_HOURS = 8;

function parse(body) {
  const text = String(body || '');
  const behindMatch = text.match(BEHIND_FIELD_RE);
  const freshnessMatch = text.match(FRESHNESS_FIELD_RE);
  return {
    behind_at_handoff: behindMatch ? Number(behindMatch[1]) : null,
    rebase_freshness: freshnessMatch ? freshnessMatch[1] : null,
  };
}

function freshnessAgeHours(iso, now = Date.now()) {
  const parsed = Date.parse(iso || '');
  if (!Number.isFinite(parsed)) return null;
  return (now - parsed) / 3_600_000;
}

function validate(body, opts = {}) {
  const fields = parse(body);
  const violations = [];
  const advisories = [];
  if (fields.behind_at_handoff == null) {
    advisories.push('missing-behind-at-handoff');
  } else if (fields.behind_at_handoff > MAX_BEHIND_AT_HANDOFF) {
    violations.push({ rule: 'behind-at-handoff-exceeds-rescope-tier',
      value: fields.behind_at_handoff, limit: MAX_BEHIND_AT_HANDOFF });
  }
  if (fields.rebase_freshness == null) {
    advisories.push('missing-rebase-freshness');
  } else {
    const ageHours = freshnessAgeHours(fields.rebase_freshness, opts.now);
    if (ageHours == null) advisories.push('rebase-freshness-unparseable');
    else if (ageHours > MAX_FRESHNESS_AGE_HOURS) {
      violations.push({ rule: 'rebase-freshness-too-old',
        age_hours: +ageHours.toFixed(2), limit_hours: MAX_FRESHNESS_AGE_HOURS });
    }
  }
  return { ok: violations.length === 0, fields, advisories, violations };
}

function advisoryComment(result) {
  if (result.ok && result.advisories.length === 0) return null;
  const lines = ['<!-- collab-handoff-rebase-freshness -->',
    '## ⚠ Collaborator Handoff Rebase Freshness'];
  if (result.advisories.includes('missing-behind-at-handoff')) {
    lines.push('- `behind_at_handoff: <int>` not declared (advisory; Epic #1827 AC5 bridge mode).');
  }
  if (result.advisories.includes('missing-rebase-freshness')) {
    lines.push('- `rebase_freshness: <ISO8601>` not declared (advisory; Epic #1827 AC5 bridge mode).');
  }
  for (const violation of result.violations) {
    lines.push(`- **${violation.rule}** — ${JSON.stringify(violation)}`);
  }
  return lines.join('\n');
}

module.exports = { parse, validate, advisoryComment, freshnessAgeHours,
  BEHIND_FIELD_RE, FRESHNESS_FIELD_RE, MAX_BEHIND_AT_HANDOFF, MAX_FRESHNESS_AGE_HOURS };
