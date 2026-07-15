#!/usr/bin/env node
// governance-audit-coverage — parse harness-goal-controls.md and assert each
// goal G1..G10 has >=1 Enforcement row AND >=1 Evidence row. Per #1973.
// Output: ~/.megingjord/governance-audit-coverage.json (or /tmp/ fallback).
// G6: degraded mode emits advisory comment on parse error (no block).

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const CATALOG_PATH = path.join(__dirname, '..', '..', 'wiki', 'concepts', 'harness-goal-controls.md');
const OUTPUT_DIR_PRIMARY = path.join(os.homedir(), '.megingjord');
const REQUIRED_GOALS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10'];

/** Split markdown into per-goal sections by `## G<N>` headings.
 * @param {string} md - markdown body.
 * @returns {object} map of goalId -> section body. */
function splitGoalSections(md) {
  const sections = {};
  const lines = String(md || '').split('\n');
  let currentGoal = null;
  let buffer = [];
  for (const line of lines) {
    const heading = line.match(/^##\s+(G\d+)\s+/);
    if (heading) {
      if (currentGoal) sections[currentGoal] = buffer.join('\n');
      currentGoal = heading[1];
      buffer = [];
      continue;
    }
    const otherHeading = /^##\s+(?!G\d+)/.test(line);
    if (otherHeading && currentGoal) {
      sections[currentGoal] = buffer.join('\n');
      currentGoal = null;
      buffer = [];
      continue;
    }
    if (currentGoal) buffer.push(line);
  }
  if (currentGoal) sections[currentGoal] = buffer.join('\n');
  return sections;
}

/** Count Enforcement + Evidence rows in a section's body.
 * @param {string} sectionBody - markdown table content for one goal.
 * @returns {object} {enforcement, evidence} counts. */
function countLayerRows(sectionBody) {
  const lines = String(sectionBody || '').split('\n');
  let enforcement = 0;
  let evidence = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('| ') && !trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const layer = cells[0].toLowerCase();
    if (layer === 'enforcement') enforcement += 1;
    else if (layer === 'evidence') evidence += 1;
  }
  return { enforcement, evidence };
}

/** Build the per-goal coverage matrix.
 * @param {string} md - control catalog markdown.
 * @returns {object} { matrix, violations, ok }. */
function auditCoverage(md) {
  const sections = splitGoalSections(md);
  const matrix = {};
  const violations = [];
  for (const goalId of REQUIRED_GOALS) {
    if (!(goalId in sections)) {
      matrix[goalId] = { enforcement: 0, evidence: 0, ok: false, reason: 'section-missing' };
      violations.push({ goal: goalId, rule: 'section-missing' });
      continue;
    }
    const counts = countLayerRows(sections[goalId]);
    const ok = counts.enforcement >= 1 && counts.evidence >= 1;
    matrix[goalId] = { ...counts, ok, reason: ok ? null : 'enforcement-or-evidence-missing' };
    if (!ok) violations.push({ goal: goalId, rule: 'enforcement-or-evidence-missing', ...counts });
  }
  return { matrix, violations, ok: violations.length === 0 };
}

/** Resolve a writable output directory; primary, then /tmp fallback.
 * @returns {string} usable absolute path. */
function resolveOutputDir() {
  try { fs.mkdirSync(OUTPUT_DIR_PRIMARY, { recursive: true }); return OUTPUT_DIR_PRIMARY; }
  catch (_) { return '/tmp'; }
}

/** Write the coverage report to disk; never throws.
 * @param {object} report - the audit result.
 * @returns {string|null} path on success, null on failure (degraded). */
function writeReport(report) {
  try {
    const dir = resolveOutputDir();
    const out = path.join(dir, 'governance-audit-coverage.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    return out;
  } catch (_) { return null; }
}

/** CLI entry: read catalog, audit, write, set exit code.
 * @param {string[]} _argv - process argv slice (unused).
 * @returns {number} exit code (0 ok, 1 violations, 2 degraded parse failure). */
function main(_argv) {
  let md;
  try { md = fs.readFileSync(CATALOG_PATH, 'utf8'); }
  catch (_) {
    console.error('DEGRADED: catalog parse failure — advisory only');
    return 2;
  }
  const start = process.hrtime.bigint();
  const audit = auditCoverage(md);
  const elapsed_ms = Number(process.hrtime.bigint() - start) / 1e6;
  const report = { ...audit, generated_at: new Date().toISOString(), elapsed_ms, catalog: CATALOG_PATH };
  const out = writeReport(report);
  console.log(JSON.stringify({ ok: audit.ok, violations: audit.violations.length, report_path: out }));
  return audit.ok ? 0 : 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { splitGoalSections, countLayerRows, auditCoverage, writeReport, resolveOutputDir, REQUIRED_GOALS, CATALOG_PATH };
