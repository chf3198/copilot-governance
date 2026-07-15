'use strict';
// Refs #3329 / Epic #1299 — HITL CLI for ac-suggest (AC4). Per-AC accept / edit / reject with a
// non-interactive --json mode for agent callers. The Manager is the intent oracle; this CLI is the
// human-in-the-loop surface (CLI chosen over GitHub-comment / dashboard in Phase-0 #1302: lowest
// friction, zero new surface, scriptable).

const readline = require('readline');
const core = require('./ac-suggest');

function parseArgs(argv) {
  const opts = { json: false, problem: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--problem') opts.problem = argv[++i] || '';
    else if (arg === '--problem-file') opts.problem = require('fs').readFileSync(argv[++i], 'utf8');
    else if (!opts.problem) opts.problem = arg;
  }
  return opts;
}

// Render the final accepted ACs as Epic-body markdown lines.
function renderAcceptedBlock(accepted) {
  return accepted.map((s, i) => `- [ ] **AC${i + 1}**: ${s.text}`).join('\n');
}

async function runJson(opts) {
  const { suggestions, source } = await core.suggestACs(opts.problem);
  const { accepted, rejected, verdicts } = core.validateSuggestions(suggestions);
  core.logMeasurement({ mode: 'json', source, accepted: accepted.length, rejected: rejected.length });
  process.stdout.write(JSON.stringify({ source, accepted, rejected, verdicts }, null, 2) + '\n');
  return 0;
}

function ask(rl, q) { return new Promise((res) => rl.question(q, res)); }

async function runInteractive(opts) {
  const { suggestions, source } = await core.suggestACs(opts.problem);
  const { verdicts } = core.validateSuggestions(suggestions);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const approved = [];
  process.stdout.write(`\nSuggested ACs (source: ${source}). Backstop = epic-ac-reconcile.js measurability.\n`);
  for (const verdict of verdicts) {
    const flag = verdict.accepted ? 'MEASURABLE' : `REJECTED (${verdict.classifier && verdict.classifier.reason || 'unmeasurable'})`;
    process.stdout.write(`\n[${verdict.ac_id}] ${verdict.text}\n  backstop: ${flag} | evidence: ${(verdict.evidence_refs || []).join(',') || 'none'}\n`);
    const ans = (await ask(rl, '  (a)ccept / (e)dit / (r)eject [r if rejected by backstop]: ')).trim().toLowerCase();
    if (ans === 'a' && verdict.accepted) approved.push({ text: verdict.text });
    else if (ans === 'e') {
      const edited = (await ask(rl, '  new text: ')).trim();
      if (edited && core.classifyMeasurability(edited).measurable) approved.push({ text: edited });
      else process.stdout.write('  (edit not measurable — dropped)\n');
    } // default / 'r' → reject
  }
  rl.close();
  core.logMeasurement({ mode: 'interactive', source, approved: approved.length, offered: verdicts.length });
  process.stdout.write('\n--- Approved AC block ---\n' + (renderAcceptedBlock(approved) || '(none approved)') + '\n');
  return 0;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (!opts.problem || !opts.problem.trim()) {
    process.stderr.write('usage: ac-suggest [--json] --problem "<statement>" | --problem-file <path>\n');
    return 2;
  }
  return opts.json ? runJson(opts) : runInteractive(opts);
}

module.exports = { main, parseArgs, renderAcceptedBlock };

if (require.main === module) { main(process.argv.slice(2)).then((c) => process.exit(c)); }
