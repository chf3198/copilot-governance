'use strict';
// decisions-md-validator (#1670) — asserts every block in docs/decisions.md matches schema.

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_FIELDS = ['Status', 'Decided-by', 'Team-context', 'Surface', 'Decision', 'Why'];
const BLOCK_RE = /^##\s+(\d{4}-\d{2}-\d{2})\s+—\s+(D-\d{4,}):\s+(.+)$/gm;

function parseBlocks(text) {
  const blocks = [];
  let match;
  while ((match = BLOCK_RE.exec(text)) !== null) {
    blocks.push({ date: match[1], id: match[2], title: match[3], start: match.index });
  }
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].end = i + 1 < blocks.length ? blocks[i + 1].start : text.length;
    blocks[i].body = text.slice(blocks[i].start, blocks[i].end);
  }
  return blocks;
}

function checkBlock(block) {
  const violations = [];
  for (const field of REQUIRED_FIELDS) {
    const re = new RegExp(`-\\s+\\*\\*${field}\\*\\*:`);
    if (!re.test(block.body)) violations.push(`missing-${field.toLowerCase()}`);
  }
  return violations;
}

function checkMonotonic(blocks) {
  const violations = [];
  for (let i = 1; i < blocks.length; i++) {
    const prev = parseInt(blocks[i - 1].id.slice(2), 10);
    const curr = parseInt(blocks[i].id.slice(2), 10);
    if (curr <= prev) violations.push(`non-monotonic: ${blocks[i].id} after ${blocks[i - 1].id}`);
  }
  return violations;
}

function validate(text) {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) return { ok: false, violations: ['no-blocks-found'] };
  const violations = [];
  for (const block of blocks) {
    const fieldViolations = checkBlock(block);
    for (const v of fieldViolations) violations.push(`${block.id}: ${v}`);
  }
  for (const v of checkMonotonic(blocks)) violations.push(v);
  return { ok: violations.length === 0, violations, blocks: blocks.length };
}

if (require.main === module) {
  const filePath = process.argv[2] || path.join(__dirname, '..', '..', 'docs', 'decisions.md');
  const text = fs.readFileSync(filePath, 'utf8');
  const result = validate(text);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

module.exports = { validate, parseBlocks, checkBlock, checkMonotonic, REQUIRED_FIELDS };
