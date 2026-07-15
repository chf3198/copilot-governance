#!/usr/bin/env node
'use strict';
// instructions-split-classifier.js (#3139, Epic #3137 T1): classify each CLAUDE.md @-imported
// instruction as binding-resident vs situational-on-demand, so the always-resident set shrinks
// WITHOUT dropping any binding governance rule. Fail-open: uncertain or core-identity -> resident.
// Deterministic, local, $0 — no LLM.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const BINDING_RE =
  /\b(MUST|required|forbidden|non-negotiable|invariant|mandatory|shall not|deny|gate fails)\b/i;
// Core-identity instructions ALWAYS resident regardless of keyword count (fail-open to governance).
const CORE_RESIDENT = [
  'role-baton-routing',
  'operator-identity-context',
  'team-model-signing',
  'global-standards',
  'global-task-router',
  'ticket-driven-work',
  'github-governance',
  'test-methodology-matrix',
];
// Clearly situational/reference instructions: load on demand only when the work needs them.
const SITUATIONAL = [
  'visual-qa-governance',
  'playwright-mcp-low-resource',
  'owasp-agentic-mapping',
  'repo-health-onboarding',
];

/** Instruction basenames @-imported by CLAUDE.md (the resident set).
 * @param {string} claudeMd path. @returns {string[]} basenames. */
function importedInstructions(claudeMd) {
  if (!fs.existsSync(claudeMd)) return [];
  return [...fs.readFileSync(claudeMd, 'utf8').matchAll(/@instructions\/(\S+\.md)/g)].map(
    (match) => match[1]
  );
}

/** Classify one instruction file (fail-open to resident).
 * @param {string} name basename. @returns {object} {name, classification, reason}. */
function classify(name) {
  const stem = name.replace(/\.instructions\.md$/, '');
  if (CORE_RESIDENT.includes(stem))
    return { name, classification: 'resident', reason: 'core-identity' };
  if (SITUATIONAL.includes(stem))
    return { name, classification: 'on-demand', reason: 'situational-reference' };
  const file = path.join(root, 'instructions', name);
  const bindingLines = fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => BINDING_RE.test(line)).length
    : 1;
  return bindingLines > 0
    ? { name, classification: 'resident', reason: `binding-signals=${bindingLines}` }
    : { name, classification: 'on-demand', reason: 'no-binding-signal' };
}

/** Classify every @-imported instruction. @param {string} claudeMd path. @returns {object[]} */
function classifyAll(claudeMd) {
  return importedInstructions(claudeMd).map(classify);
}

function main() {
  const results = classifyAll(path.join(root, 'CLAUDE.md'));
  const onDemand = results.filter((entry) => entry.classification === 'on-demand');
  process.stdout.write(
    `instructions-split: ${results.length} imported; ${onDemand.length} on-demand candidate(s)\n`
  );
  for (const entry of onDemand)
    process.stdout.write(`  on-demand: ${entry.name} (${entry.reason})\n`);
}

if (require.main === module) main();
module.exports = { classify, classifyAll, importedInstructions, CORE_RESIDENT, SITUATIONAL };
