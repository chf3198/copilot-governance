#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { review } = require('./multi-judge-orchestrator');
const { normalize } = require('./operator-ownership-rules');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXED = ['.github/copilot-instructions.md', 'AGENTS.md', 'CLAUDE.md', '.codex/AGENTS.md'];
const BLOCKED = [/\byou\s+will\s+need\s+to\b/i, /\bplease\s+manually\b/i,
  /\bthe\s+user\s+must\b/i, /\brun\s+this\s+yourself\b/i];
const PROHIBITIONS = [/\bnever\s+ask\s+the\s+user\b/i, /\bdo\s+not\s+ask\s+(the\s+)?user\b/i,
  /\bdo\s+not\s+delegate\b/i, /\bmust\s+not\s+ask\b/i];
const META = [/\bcatch\s+yourself\s+writing\b/i, /\bself-anneal\s+check\b/i,
  /\banti-pattern\b/i, /\bforbidden\b/i];
const VERB = /\b(run|execute|install|delete|deploy|open|click|configure)\b/i;
const TARGET = /\b(user|client|operator)\b/i;

/** @returns {string[]} workspace-relative instruction files */
function listInstructionFiles() {
  const dir = path.join(ROOT, 'instructions');
  const out = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.instructions.md')) out.push(path.relative(ROOT, full));
    }
  };
  walk(dir);
  return out;
}

/** @param {string} line */
function isProhibition(line) { return PROHIBITIONS.some(re => re.test(line)); }
/** @param {string} line */
function isMeta(line) { return META.some(re => re.test(line)); }
/** @param {string} line */
function direct(line) { return BLOCKED.some(re => re.test(line)); }
/** @param {string} line */
function heuristic(line) {
  if (isProhibition(line)) return false;
  return TARGET.test(line) && VERB.test(line) && /\b(must|need|should|please|required)\b/i.test(line);
}

/** @param {string} line */
async function judge(line) {
  const dispatcher = async (_, prompt) => ({
    score: heuristic(prompt) ? 0.93 : 0.09,
    rationale: heuristic(prompt) ? 'delegation-like paraphrase' : 'safe/prohibition context',
  });
  const result = await review({ line }, { dispatcher });
  return result.mean >= 0.8;
}

/** @param {string} rel */
async function scanFile(rel) {
  const full = path.join(ROOT, rel);
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = normalize(raw);
    if (isProhibition(line) || isMeta(line)) continue;
    if (direct(line)) findings.push({ file: rel, line: i + 1, rule: 'direct', sample: raw.trim() });
    else if (heuristic(line) && await judge(line)) {
      findings.push({ file: rel, line: i + 1, rule: 'judge-paraphrase', sample: raw.trim() });
    }
  }
  return findings;
}

/** @returns {Promise<void>} */
async function run() {
  const files = [...listInstructionFiles(), ...FIXED];
  const all = [];
  for (const file of files) all.push(...await scanFile(file));
  if (all.length) {
    process.stderr.write('delegation-lint: found delegated manual execution phrasing\n');
    for (const finding of all) process.stderr.write(`- ${finding.file}:${finding.line} [${finding.rule}] ${finding.sample}\n`);
    process.stderr.write('remediation: keep operator-owned execution and user-as-client language\n');
    process.exit(1);
  }
  process.stdout.write('delegation-lint: clean\n');
}

module.exports = { run, scanFile, isProhibition, isMeta, direct, heuristic, listInstructionFiles };
if (require.main === module) run().catch(e => { process.stderr.write(`${e.message}\n`); process.exit(2); });
