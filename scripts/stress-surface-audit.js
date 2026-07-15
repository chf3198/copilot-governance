#!/usr/bin/env node
// stress-surface-audit (#1875 Phase 5) — audits scripts/global/*.js for modules
// meeting stress-applicability criteria but lacking a tests/stress-*.spec.js spec.
// Output: prioritized backfill list for follow-on tickets.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts', 'global');
const TESTS_DIR = path.join(ROOT, 'tests');

// Stress-applicability signal patterns. Detected via source-level inspection.
const CONCURRENCY_SIGNALS = [/\bflock\b/i, /\bacquire\(/i, /\bopenSync\s*\(\s*[^,]+,\s*['"]wx/i,
  /\blinkSync\b/i, /readLock|writeLock|sessionLock/i, /\bcross-team-lease\b/i];
const STATE_MUTATION_SIGNALS = [/appendFileSync\b/i, /\bwriteFileSync\b/i, /\bunlinkSync\b/i,
  /JSONL|jsonl/, /registry\.json|leases\.json/];
const UNTRUSTED_INPUT_SIGNALS = [/parse(?:Body|Comment|Handoff|Closeout)/i,
  /matchAll\(/i, /\bregex\b/i, /\brecognition\b/i];
const PERF_SIGNALS = [/p\d{2}\s*<|<\s*\d+\s*ms|latency.*budget|slo|SLO/i,
  /timeout.*ms|throughput|cache.*hit/i];

function classifySurface(filePath) {
  let content = '';
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return null; }
  const reasons = [];
  if (CONCURRENCY_SIGNALS.some(r => r.test(content))) reasons.push('concurrency');
  if (STATE_MUTATION_SIGNALS.some(r => r.test(content))) reasons.push('state-mutation');
  if (UNTRUSTED_INPUT_SIGNALS.some(r => r.test(content))) reasons.push('untrusted-input');
  if (PERF_SIGNALS.some(r => r.test(content))) reasons.push('perf-budget');
  return reasons.length > 0 ? reasons : null;
}

function stressSpecNameFor(basename) {
  const stem = basename.replace(/\.js$/, '');
  return `tests/stress-${stem}.spec.js`;
}

function priorityFromReasons(reasons) {
  // Concurrency = highest blast radius; state-mutation second; perf third; untrusted-input fourth.
  if (reasons.includes('concurrency')) return 'P1';
  if (reasons.includes('state-mutation')) return 'P2';
  if (reasons.includes('perf-budget')) return 'P2';
  return 'P3';
}

function audit() {
  if (!fs.existsSync(SCRIPTS_DIR)) return [];
  const findings = [];
  for (const entry of fs.readdirSync(SCRIPTS_DIR)) {
    if (!entry.endsWith('.js')) continue;
    const full = path.join(SCRIPTS_DIR, entry);
    const reasons = classifySurface(full);
    if (!reasons) continue;
    const stressSpec = stressSpecNameFor(entry);
    const stressExists = fs.existsSync(path.join(ROOT, stressSpec));
    if (stressExists) continue;
    findings.push({ file: `scripts/global/${entry}`, reasons,
      priority: priorityFromReasons(reasons), expected_spec: stressSpec });
  }
  findings.sort((a, b) => a.priority.localeCompare(b.priority) || a.file.localeCompare(b.file));
  return findings;
}

if (require.main === module) {
  const findings = audit();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ count: findings.length, findings }, null, 2) + '\n');
  } else {
    process.stdout.write(`\nStress-surface backfill audit (#1875 Phase 5):\n`);
    process.stdout.write(`Found ${findings.length} module(s) meeting stress-criteria without specs.\n\n`);
    for (const f of findings) {
      process.stdout.write(`  [${f.priority}] ${f.file}\n`);
      process.stdout.write(`    reasons: ${f.reasons.join(', ')}\n`);
      process.stdout.write(`    expected: ${f.expected_spec}\n\n`);
    }
  }
}

module.exports = { audit, classifySurface, stressSpecNameFor, priorityFromReasons,
  CONCURRENCY_SIGNALS, STATE_MUTATION_SIGNALS, UNTRUSTED_INPUT_SIGNALS, PERF_SIGNALS };
