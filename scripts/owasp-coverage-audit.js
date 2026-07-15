#!/usr/bin/env node
// owasp-coverage-audit — assert every OWASP Agentic Top 10 row in the
// mapping instruction file is either Enforced or has an explicit Deferred
// classification with documented rationale. Per #1987.

'use strict';
const fs = require('fs');
const path = require('path');

const MAPPING_FILE = path.join(__dirname, '..', '..', 'instructions',
  'owasp-agentic-mapping.instructions.md');
const REQUIRED_RISKS = ['OA1', 'OA2', 'OA3', 'OA4', 'OA5', 'OA6', 'OA7', 'OA8', 'OA9', 'OA10'];

/** Read mapping file and return its text body.
 * @returns {string} file contents. */
function readMapping() {
  return fs.readFileSync(MAPPING_FILE, 'utf8');
}

/** Parse the OWASP risk mapping table into per-risk rows.
 * @param {string} md - mapping markdown body.
 * @returns {object} map of riskId -> { coverage, raw }. */
function parseRiskRows(md) {
  const out = {};
  const lineRe = /^\|\s*(OA\d+)\s*\|/gm;
  const lines = String(md || '').split('\n');
  for (const line of lines) {
    const match = line.match(/^\|\s*(OA\d+)\s*\|/);
    if (!match) continue;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;
    out[match[1]] = { risk_id: cells[0], coverage_cell: cells[3] || '', raw: line };
  }
  return out;
}

/** Classify a coverage cell as enforced | deferred | other.
 * @param {string} cell - the cell text.
 * @returns {string} classification. */
function classify(cell) {
  const text = String(cell || '').toLowerCase();
  if (/\benforced\b/.test(text)) return 'enforced';
  if (/\bdeferred\b/.test(text)) return 'deferred';
  if (/\badvisory\b/.test(text)) return 'advisory';
  if (/\bpartial\b/.test(text)) return 'partial';
  return 'unknown';
}

/** Audit all required risks; report any not classified Enforced or Deferred.
 * @param {string} md - mapping markdown body.
 * @returns {object} { ok, classifications, violations }. */
function audit(md) {
  const rows = parseRiskRows(md);
  const classifications = {};
  const violations = [];
  for (const riskId of REQUIRED_RISKS) {
    if (!(riskId in rows)) {
      classifications[riskId] = 'missing-row';
      violations.push({ risk: riskId, rule: 'missing-row' });
      continue;
    }
    const cls = classify(rows[riskId].coverage_cell);
    classifications[riskId] = cls;
    if (cls === 'advisory' || cls === 'partial' || cls === 'unknown') {
      violations.push({ risk: riskId, rule: `coverage-not-enforced-or-deferred`, classification: cls });
    }
  }
  return { ok: violations.length === 0, classifications, violations };
}

/** Confirm deferred risks have documented rationale section.
 * @param {string} md - mapping markdown body.
 * @param {object} classifications - risk -> classification map.
 * @returns {Array} violations for missing rationale. */
function auditDeferralRationale(md, classifications) {
  const violations = [];
  for (const [riskId, cls] of Object.entries(classifications)) {
    if (cls !== 'deferred') continue;
    const sectionRe = new RegExp(`##\\s+${riskId}\\s+Deferral\\s+Rationale`, 'i');
    if (!sectionRe.test(md)) {
      violations.push({ risk: riskId, rule: 'deferred-without-rationale' });
    }
  }
  return violations;
}

if (require.main === module) {
  const md = readMapping();
  const result = audit(md);
  const rationaleViolations = auditDeferralRationale(md, result.classifications);
  const combined = { ...result, violations: [...result.violations, ...rationaleViolations] };
  combined.ok = combined.violations.length === 0;
  console.log(JSON.stringify(combined, null, 2));
  process.exit(combined.ok ? 0 : 1);
}

module.exports = { readMapping, parseRiskRows, classify, audit, auditDeferralRationale, REQUIRED_RISKS, MAPPING_FILE };
