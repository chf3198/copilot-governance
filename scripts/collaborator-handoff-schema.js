'use strict';
// collaborator-handoff-schema — single source of truth for the COLLABORATOR_HANDOFF
// structured-field contract (#1580; origin Epic #1568 / #1571).
//
// Why this module exists: the structured-field format rules were historically
// validated by ad-hoc inline regex in two divergent places —
// `collaborator-self-check-rules.js` (local pre-handoff) and
// `megalint/collaborator-handoff.js` (server-side gate; line-anchored Role #2921,
// 16-hex cross_family_receipt #2904). This module hoists that contract to one
// place so the local self-check and the server gate cannot drift apart.
//
// Layers:
//   FIELD_SCHEMA          — declarative descriptor of each structured field
//   parseHandoff(body)    — best-effort structured snapshot (extraction)
//   validateStructure(body) — format checks for fields that are PRESENT
//                             (presence/requiredness stays megalint's job; this is
//                             the shift-left format mirror so the same malformed
//                             field is caught locally before PR)
//
// Prose-content checks (flaw-marker proximity, AC-checkbox counting) are NOT here:
// they inspect free-text with no structured field to validate against and remain
// documented heuristics in collaborator-self-check-rules.js.

// Each field is line-anchored: the canonical form is `Label: value` at the start
// of a line (optionally indented). A `Label:` appearing mid-prose is a collision.
const FIELD_SCHEMA = [
  { key: 'signedBy', label: 'Signed-by', required: true },
  { key: 'teamModel', label: 'Team&Model', required: true, proseCollisionGuard: true },
  { key: 'role', label: 'Role', required: true, expect: 'collaborator', ownLine: true },
  { key: 'testStrategy', label: 'test_strategy', required: false, noMarkdownBold: true, proseCollisionGuard: true },
  { key: 'crossFamilyReviewer', label: 'cross_family_reviewer', required: false },
  { key: 'crossFamilyRating', label: 'cross_family_rating', required: false },
  { key: 'crossFamilyFindings', label: 'cross_family_findings', required: false },
  { key: 'crossFamilyReceipt', label: 'cross_family_receipt', required: false, format: 'sha256-hex16' },
];

const RECEIPT_HEX16 = /cross_family_receipt\s*:\s*[0-9a-f]{16}\b/i;
const ROLE_ANCHORED = /(?:^|\n)[ \t]*Role:[ \t]*collaborator[ \t]*(?:\n|$)/i;
const MARKDOWN_BOLD_TEST_STRATEGY = /\*\*test_strategy/;

function asBody(value) {
  return typeof value === 'string' ? value : '';
}

function escapeForRegex(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Extract the value of a line-anchored `Label: value` field, or null if absent.
function fieldValue(body, label) {
  const anchored = new RegExp(
    `(?:^|\\n)[ \\t]*${escapeForRegex(label)}[ \\t]*:[ \\t]*(.+?)[ \\t]*(?:\\n|$)`,
    'i',
  );
  const match = asBody(body).match(anchored);
  return match ? match[1].trim() : null;
}

// True when `Label:` appears on a line but NOT as the line's leading field —
// i.e. embedded in prose (the collision class the closeout/baton parsers trip on).
function fieldHasProseCollision(body, label) {
  const labelColon = new RegExp(`${escapeForRegex(label)}\\s*:\\s*(.+)$`);
  const leadingField = new RegExp(`^${escapeForRegex(label)}\\s*:`);
  const violators = [];
  for (const line of asBody(body).split('\n')) {
    if (!labelColon.test(line) || leadingField.test(line)) continue;
    // `**test_strategy:` is reported by the markdown-bold check, not as a collision.
    if (label === 'test_strategy' && /^\*\*test_strategy/.test(line)) continue;
    violators.push(line.trim());
  }
  return violators;
}

// Aggregate prose-colon collisions across every guarded field (Team&Model,
// test_strategy). Returns { collision, violators } — the canonical form the
// `no-prose-colon-collision` self-check rule now delegates to.
function detectProseColonCollision(body) {
  const violators = [];
  for (const field of FIELD_SCHEMA) {
    if (!field.proseCollisionGuard) continue;
    violators.push(...fieldHasProseCollision(body, field.label));
  }
  return { collision: violators.length > 0, violators };
}

// True when test_strategy is wrapped in markdown bold (breaks downstream
// `test_strategy:` field parsers). Canonical form for the
// `no-markdown-bold-on-test-strategy` self-check rule.
function testStrategyMarkdownBold(body) {
  return MARKDOWN_BOLD_TEST_STRATEGY.test(asBody(body));
}

// Best-effort structured snapshot of a COLLABORATOR_HANDOFF body.
function parseHandoff(body) {
  const text = asBody(body);
  const verification = text.match(/Pre-handoff verification[^\n]*\b(PASS|FAIL|SKIPPED)\b/i);
  return {
    signedBy: fieldValue(text, 'Signed-by'),
    teamModel: fieldValue(text, 'Team&Model'),
    role: fieldValue(text, 'Role'),
    testStrategy: fieldValue(text, 'test_strategy'),
    crossFamily: {
      reviewer: fieldValue(text, 'cross_family_reviewer'),
      rating: fieldValue(text, 'cross_family_rating'),
      findings: fieldValue(text, 'cross_family_findings'),
      receipt: fieldValue(text, 'cross_family_receipt'),
    },
    preHandoffVerification: verification ? verification[1].toUpperCase() : null,
  };
}

// Per-field format checks — each returns a violation object or null. Kept as small
// named helpers so validateStructure stays short and each rule reads independently.
function roleAnchorViolation(text) {
  if (!/(?:^|\n)\s*Role\s*:/i.test(text) || ROLE_ANCHORED.test(text)) return null;
  return { field: 'Role', rule: 'role-not-line-anchored',
    detail: 'Role field must be on its own line with value collaborator (#2921)' };
}

function receiptFormatViolation(text) {
  if (!/cross_family_receipt\s*:/i.test(text) || RECEIPT_HEX16.test(text)) return null;
  return { field: 'cross_family_receipt', rule: 'cross-family-receipt-format',
    detail: 'cross_family_receipt must be a 16-char hex sha256 prefix (#2904)' };
}

function markdownBoldViolation(text) {
  if (!testStrategyMarkdownBold(text)) return null;
  return { field: 'test_strategy', rule: 'test-strategy-markdown-bold',
    detail: 'test_strategy must not be wrapped in markdown bold' };
}

function proseCollisionViolation(text) {
  const prose = detectProseColonCollision(text);
  if (!prose.collision) return null;
  return { field: 'structured', rule: 'prose-colon-collision', detail: prose.violators.join('; ') };
}

// Format checks for PRESENT fields only. Mirrors the server-side megalint format
// rules so a malformed structured field is caught locally before the PR is opened.
function validateStructure(body) {
  const text = asBody(body);
  const violations = [
    roleAnchorViolation(text),
    receiptFormatViolation(text),
    markdownBoldViolation(text),
    proseCollisionViolation(text),
  ].filter(Boolean);
  return { ok: violations.length === 0, violations };
}

module.exports = {
  FIELD_SCHEMA,
  fieldValue,
  parseHandoff,
  validateStructure,
  detectProseColonCollision,
  testStrategyMarkdownBold,
  fieldHasProseCollision,
};
