#!/usr/bin/env node
// scripts/global/docs-exec.js — opt-in fenced-block runner for docs (#801)
// Scans markdown for ```sh / ```bash blocks IMMEDIATELY preceded by an
// `<!-- exec: [timeout=Ns] -->` marker and executes the block. Blocks
// without the marker are ignored — safer default than skip-tags.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SKIP_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report', '.dashboard', '.log4brains']);
const DEFAULT_TIMEOUT_MS = 30000;
const STDERR_TAIL_CHARS = 400;
const EXEC_RE = /<!--\s*exec:?\s*(?:timeout=(\d+)s)?\s*-->\s*\n```(?:sh|bash)\n([\s\S]*?)```/g;

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

function execBlock(script, timeoutSec) {
  const timeout = timeoutSec ? parseInt(timeoutSec, 10) * 1000 : DEFAULT_TIMEOUT_MS;
  try {
    execSync(script, { timeout, stdio: 'pipe', shell: '/bin/bash' });
    return { ok: true };
  } catch (err) {
    return { ok: false, status: err.status, stderr: (err.stderr || '').toString().slice(-STDERR_TAIL_CHARS) };
  }
}

function checkFile(mdPath) {
  const text = fs.readFileSync(mdPath, 'utf-8');
  const failures = [];
  let count = 0;
  for (const match of text.matchAll(EXEC_RE)) {
    count += 1;
    const [, timeoutSec, script] = match;
    const result = execBlock(script, timeoutSec);
    if (!result.ok) {
      failures.push(`${mdPath}: exec block #${count} failed (exit ${result.status}): ${result.stderr.trim()}`);
    }
  }
  return { ran: count, failures };
}

function main() {
  const root = process.cwd();
  let totalRan = 0;
  const allFailures = [];
  for (const md of listMarkdown(root)) {
    const { ran, failures } = checkFile(md);
    totalRan += ran;
    allFailures.push(...failures);
  }
  if (allFailures.length) {
    process.stderr.write(allFailures.join('\n') + '\n');
    process.stderr.write(`\n❌ ${allFailures.length} of ${totalRan} exec block(s) failed.\n`);
    process.exit(1);
  }
  process.stdout.write(`✅ All ${totalRan} opt-in exec block(s) passed.\n`);
}

if (require.main === module) main();
module.exports = { EXEC_RE, checkFile, execBlock };
