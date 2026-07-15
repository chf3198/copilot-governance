#!/usr/bin/env node
// scripts/global/docs-anchors.js — Drift-equivalent doc-code anchor checker (#797)
// Scans .md for `<!-- anchor: path/to/file.ext[#L10-L20] [hash:abc1234] -->` markers
// and verifies the anchored file/range still matches. Fails when the anchored
// region changed without the doc being updated.
//
// Usage:
//   node scripts/global/docs-anchors.js          # check anchors, exit 1 on drift
//   node scripts/global/docs-anchors.js --fix    # rewrite hashes to current state
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FIX = process.argv.includes('--fix');
const ANCHOR_RE = /<!--\s*anchor:\s*([^\s#]+)(?:#L(\d+)(?:-L(\d+))?)?(?:\s+hash:([0-9a-f]{7,40}))?\s*-->/g;
const SKIP_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report', '.dashboard']);

function listMarkdown(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdown(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function snippetHash(filePath, startLine, endLine) {
  const content = fs.readFileSync(filePath, 'utf-8').split('\n');
  const slice = startLine ? content.slice(startLine - 1, endLine || startLine).join('\n') : content.join('\n');
  return crypto.createHash('sha1').update(slice).digest('hex').slice(0, 12);
}

function checkAnchor(match, mdPath) {
  const [full, target, startStr, endStr, declaredHash] = match;
  const targetPath = path.resolve(path.dirname(mdPath), target);
  if (!fs.existsSync(targetPath)) {
    return { violation: `${mdPath}: anchor target missing — ${target}` };
  }
  const startLine = startStr ? parseInt(startStr, 10) : null;
  const endLine = endStr ? parseInt(endStr, 10) : null;
  const currentHash = snippetHash(targetPath, startLine, endLine);
  if (!declaredHash) {
    if (FIX) return { rewrite: [full, full.replace('-->', `hash:${currentHash} -->`)] };
    return { violation: `${mdPath}: anchor missing hash for ${target} — run with --fix or paste hash:${currentHash}` };
  }
  if (declaredHash !== currentHash) {
    if (FIX) return { rewrite: [full, full.replace(`hash:${declaredHash}`, `hash:${currentHash}`)] };
    return { violation: `${mdPath}: anchor drift on ${target} — declared ${declaredHash}, actual ${currentHash}` };
  }
  return {};
}

function checkFile(mdPath) {
  const text = fs.readFileSync(mdPath, 'utf-8');
  let updated = text;
  const violations = [];
  for (const match of text.matchAll(ANCHOR_RE)) {
    const result = checkAnchor(match, mdPath);
    if (result.violation) violations.push(result.violation);
    if (result.rewrite) updated = updated.replace(result.rewrite[0], result.rewrite[1]);
  }
  if (FIX && updated !== text) fs.writeFileSync(mdPath, updated);
  return violations;
}

function main() {
  const root = process.cwd();
  const allViolations = [];
  for (const md of listMarkdown(root)) {
    allViolations.push(...checkFile(md));
  }
  if (allViolations.length) {
    process.stderr.write(allViolations.join('\n') + '\n');
    process.stderr.write(`\n❌ ${allViolations.length} anchor violation(s).\n`);
    process.exit(FIX ? 0 : 1);
  }
  process.stdout.write('✅ All doc anchors in sync with code.\n');
}

if (require.main === module) main();
module.exports = { snippetHash, checkFile, ANCHOR_RE };
