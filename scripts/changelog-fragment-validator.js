'use strict';
// changelog-fragment-validator.js (#2126) — Validates per-PR fragment files
// before aggregation. Enforces Keep-a-Changelog 1.1.0 hierarchy rules so
// aggregated CHANGELOG.md does not accumulate baseline-lint drift.
// Mitigations: T3 (H1-in-fragment), T4 (broken heading hierarchy) from the
// Phase-0 threat model at wiki/wisdom/project/research/changelog-aggregator-2120.md.

const fs = require('fs');

const ALLOWED_TOP_LEVELS = new Set([3]); // H3 is the canonical fragment-top level.

function parseHeadings(text) {
  const lines = text.split('\n');
  const out = [];
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    const match = line.match(/^(#+)\s+(.+)$/);
    if (match) out.push({ line: i + 1, level: match[1].length, text: match[2] });
  }
  return out;
}

function validateText(text, fragmentName = '<unnamed>') {
  const violations = [];
  const headings = parseHeadings(text);
  if (headings.length === 0) return { ok: true, violations };
  // T3: fragments must not contain H1 or H2 (release sections are aggregator-managed).
  for (const heading of headings) {
    if (heading.level === 1) {
      violations.push(`${fragmentName}:${heading.line} T3-h1-in-fragment — fragments must not contain H1 (got "# ${heading.text}"). Use H3 categories (### Added, ### Changed, etc.).`);
    } else if (heading.level === 2) {
      violations.push(`${fragmentName}:${heading.line} T3-h2-in-fragment — fragments must not contain H2 (got "## ${heading.text}"). Release sections are aggregator-managed; use H3 categories.`);
    }
  }
  // T4: top-level heading in fragment must be H3; nested levels increment by 1.
  const topLevel = headings[0].level;
  if (!ALLOWED_TOP_LEVELS.has(topLevel)) {
    violations.push(`${fragmentName}:${headings[0].line} T4-bad-top-level — fragment top-level heading must be H3 (got H${topLevel}: "${headings[0].text}"). Standard categories: ### Added/Changed/Fixed/Removed/Deprecated/Security.`);
  }
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1];
    const curr = headings[i];
    if (curr.level > prev.level + 1) {
      violations.push(`${fragmentName}:${curr.line} T4-heading-increment-skip — H${prev.level} ("${prev.text}") followed by H${curr.level} ("${curr.text}") skips a level.`);
    }
  }
  return { ok: violations.length === 0, violations };
}

function validateFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return validateText(text, filePath);
}

function validateAll(fragments) {
  const allViolations = [];
  for (const fragment of fragments) {
    const result = validateFile(fragment.path);
    if (!result.ok) allViolations.push(...result.violations);
  }
  return { ok: allViolations.length === 0, violations: allViolations };
}

module.exports = { validateText, validateFile, validateAll, parseHeadings };
