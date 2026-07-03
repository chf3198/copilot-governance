#!/usr/bin/env node
'use strict';
// instructional-coverage-audit (#1894 AC4) — scans instructions/*.md for
// MUST / MUST NOT / SHALL language and emits inventory of statements
// lacking corresponding programmatic enforcement. Per Epic #1894 contract:
// instructional governance is insufficient when less-capable models cannot
// reliably honor it; this audit surfaces the gap inventory.

const fs = require('node:fs');
const path = require('node:path');

const INSTRUCTIONS_DIR = path.join(__dirname, '..', '..', 'instructions');
const VALIDATORS_DIR = path.join(__dirname, 'megalint');
const MUST_RE = /\b(MUST|MUST NOT|SHALL|SHALL NOT|REQUIRED)\b/g;
const NOISE_KEYWORDS = ['for example', 'e.g.', 'i.e.', 'see also'];

function listInstructionFiles(dir = INSTRUCTIONS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => name.endsWith('.md')).map(name => path.join(dir, name));
}

function listValidatorNames(dir = VALIDATORS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => name.endsWith('.js') && name !== 'index.js')
    .map(name => name.replace(/\.js$/, ''));
}

function extractStatements(content) {
  const out = [];
  const lines = String(content || '').split('\n');
  for (let lineNum = 0; lineNum < lines.length; lineNum += 1) {
    const line = lines[lineNum];
    if (NOISE_KEYWORDS.some(noise => line.toLowerCase().includes(noise))) continue;
    if (MUST_RE.test(line)) {
      MUST_RE.lastIndex = 0;
      out.push({ line: lineNum + 1, text: line.trim().slice(0, 200) });
    }
  }
  return out;
}

function findValidatorHint(statementText, validatorNames) {
  const lower = statementText.toLowerCase();
  for (const validator of validatorNames) {
    const hint = validator.replace(/-/g, ' ').toLowerCase();
    if (lower.includes(hint)) return validator;
  }
  return null;
}

function auditFile(filePath, validatorNames) {
  const content = fs.readFileSync(filePath, 'utf8');
  const statements = extractStatements(content);
  return statements.map(statement => ({
    file: path.basename(filePath), line: statement.line, text: statement.text,
    validator_hint: findValidatorHint(statement.text, validatorNames),
  }));
}

function audit(opts = {}) {
  const files = opts.files || listInstructionFiles(opts.instructionsDir);
  const validatorNames = opts.validatorNames || listValidatorNames(opts.validatorsDir);
  const entries = [];
  for (const file of files) entries.push(...auditFile(file, validatorNames));
  const unguarded = entries.filter(entry => !entry.validator_hint);
  return {
    files_scanned: files.length, total_must_statements: entries.length,
    guarded_count: entries.length - unguarded.length, unguarded_count: unguarded.length,
    guarded_rate: entries.length === 0 ? 1 : (entries.length - unguarded.length) / entries.length,
    unguarded, entries,
  };
}

if (require.main === module) {
  const result = audit();
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else {
    process.stdout.write(`instructional-coverage-audit (#1894 AC4)\n`);
    process.stdout.write(`  files: ${result.files_scanned}, MUST statements: ${result.total_must_statements}\n`);
    process.stdout.write(`  guarded: ${result.guarded_count} (${(result.guarded_rate*100).toFixed(1)}%); unguarded: ${result.unguarded_count}\n`);
    for (const item of result.unguarded.slice(0, 20)) {
      process.stdout.write(`  - ${item.file}:${item.line} ${item.text.slice(0, 100)}\n`);
    }
  }
  process.exit(0);
}

module.exports = { audit, auditFile, extractStatements, findValidatorHint,
  listInstructionFiles, listValidatorNames, MUST_RE };
