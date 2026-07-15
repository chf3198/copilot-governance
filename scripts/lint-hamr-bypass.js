#!/usr/bin/env node
'use strict';
// tier: 3
/* lint-hamr-bypass — detect HAMR-bypass patterns across the repo.
 *
 * Per #1150 / Epic #1130 / D-1148-003. Advisory-first; promote to
 * required gate after migration sites are migrated.
 *
 * Detection patterns (greppable; cheap):
 *   - fetch(...:11434         (raw Ollama HTTP)
 *   - new OpenAI(             (raw OpenAI SDK)
 *   - new Anthropic(          (raw Anthropic SDK)
 *   - axios.(get|post)        (provider hosts)
 *   - requests.(get|post)     (Python provider calls)
 *   - curl http               (shell scripts; provider endpoints)
 *
 * Diagnostic carve-out (per #1155 D-1148-004):
 *   Annotate the line above the bypass with:
 *     // hamr-bypass-ok: diagnostic <one-line reason>
 *   Lint accepts the line. Reserve for genuinely-uncoverable cases.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const ADVISORY = !process.env.HAMR_BYPASS_GATE;
const OLLAMA_PORT = 11434;
const SOURCE_PREVIEW_LIMIT = 120;

const PATTERNS = [
  { name: 'ollama-http', regex: new RegExp(`fetch\\s*\\(\\s*['"\`]http[s]?:\\/\\/[^'"\`]*:${OLLAMA_PORT}`), langs: ['.js', '.mjs', '.ts'] },
  { name: 'openai-sdk', regex: /new\s+OpenAI\s*\(/, langs: ['.js', '.mjs', '.ts'] },
  { name: 'anthropic-sdk', regex: /new\s+Anthropic\s*\(/, langs: ['.js', '.mjs', '.ts'] },
  { name: 'axios-provider', regex: /axios\.(get|post)\s*\(\s*['"`]http[s]?:\/\/[^'"`]*(api\.(openai|anthropic)|console\.groq|api\.cerebras|generativelanguage\.googleapis|hamr\.[\w.]+)/, langs: ['.js', '.mjs', '.ts'] },
  { name: 'python-requests', regex: new RegExp(`requests\\.(get|post)\\s*\\(\\s*['"]http[s]?:\\/\\/[^'"]*:${OLLAMA_PORT}`), langs: ['.py'] },
  { name: 'curl-ollama', regex: new RegExp(`curl\\s+(?:-[A-Za-z]+\\s+)*['"\`]?http[s]?:\\/\\/[^\\s'"\`]*:${OLLAMA_PORT}`), langs: ['.sh'] },
];

const IGNORE_PATHS = ['node_modules', '.git', '.dashboard', 'logs', 'tmp', '.worktrees', 'test-results', 'playwright-report'];
const IGNORE_FILES = new Set(['fleet-via-hamr.js', 'hamr-provider-wrapper.js', 'litellm-client.js', 'lint-hamr-bypass.js']);

function shouldSkip(rel) {
  return IGNORE_PATHS.some((p) => rel.startsWith(p)) || IGNORE_FILES.has(path.basename(rel));
}

function walk(dir, results) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && !['github'].includes(entry.name.replace('.', ''))) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (shouldSkip(rel)) continue;
    if (entry.isDirectory()) walk(full, results);
    else if (entry.isFile()) results.push(rel);
  }
}

function scanFile(rel) {
  const violations = [];
  const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = content.split('\n');
  const ext = path.extname(rel);
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    for (const pattern of PATTERNS) {
      if (!pattern.langs.includes(ext)) continue;
      if (!pattern.regex.test(line)) continue;
      const prevLine = idx > 0 ? lines[idx - 1] : '';
      if (/hamr-bypass-ok:\s*diagnostic/.test(prevLine)) continue;
      violations.push({ file: rel, line: idx + 1, pattern: pattern.name, source: line.trim().slice(0, SOURCE_PREVIEW_LIMIT) });
    }
  }
  return violations;
}

function main() {
  const files = [];
  walk(ROOT, files);
  const allViolations = [];
  for (const rel of files) {
    try { allViolations.push(...scanFile(rel)); }
    catch { /* skip unreadable */ }
  }
  if (allViolations.length === 0) {
    console.log('✅ No HAMR-bypass patterns detected.');
    return;
  }
  console.warn(`⚠ Detected ${allViolations.length} HAMR-bypass site(s):`);
  for (const violation of allViolations) console.warn(`  ${violation.file}:${violation.line} [${violation.pattern}] ${violation.source}`);
  const tag = ADVISORY ? 'ADVISORY' : 'GATE';
  console.warn(`\n${tag}: ${allViolations.length} bypass site(s). Migrate via fleet-via-hamr or wrapProviderCall.`);
  if (!ADVISORY) process.exit(1);
}

if (require.main === module) main();
module.exports = { scanFile, PATTERNS };
