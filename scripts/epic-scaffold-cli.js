'use strict';
// epic-scaffold-cli (#3713, Epic #3255 Phase-1) — the thin `gh` apply path for epic-scaffold.
// Default is DRY-RUN (prints the plan + round-trip result, no writes); `--apply` creates the
// Epic + the single R&P gate child, links the sub-issue, injects the gate ref, re-validates,
// and emits the G8 provenance line. $0: gh CLI only, no model call. gh exec is injectable so
// the whole flow is unit-testable with no network.
const { execFileSync } = require('node:child_process');
const scaffold = require('./epic-scaffold');

const DRY_EPIC = 111; // placeholder issue numbers used only to validate the plan in dry-run
const DRY_CHILD = 222;

function parseArgs(argv) {
  const parsed = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') parsed.apply = true;
    else if (arg.startsWith('--')) { parsed[arg.slice(2)] = argv[i + 1]; i += 1; }
  }
  return parsed;
}

// Default gh executor: create/edit issues, return the new issue number on create.
function defaultExecGh(args) {
  const out = execFileSync('gh', args, { encoding: 'utf8' });
  const match = out.match(/\/issues\/(\d+)/);
  return match ? Number(match[1]) : out.trim();
}

// Create the Epic, then the R&P gate child, link them, inject the gate ref, re-validate.
function applyScaffold(opts, deps = {}) {
  const execGh = deps.execGh || defaultExecGh;
  const log = deps.log || console.log;
  const plan = scaffold.planScaffold(opts);
  if (!opts.apply) {
    // Validate a representative FINAL body (the one apply will land, with the gate ref injected).
    const finalBody = scaffold.buildEpicBody({ ...opts, childNumber: DRY_CHILD });
    const check = scaffold.roundTripCheck({ epicLabels: plan.epic.labels, epicBody: finalBody, epicNumber: DRY_EPIC, childNumber: DRY_CHILD });
    log(JSON.stringify({ mode: 'dry-run', epic: { labels: plan.epic.labels, body: finalBody }, roundTrip: check }, null, 2));
    return { mode: 'dry-run', roundTrip: check };
  }
  const epicNumber = execGh(['issue', 'create', '--title', String(opts.title || 'untitled'), '--label', plan.epic.labels.join(','), '--body', plan.epic.body]);
  const childNumber = execGh(['issue', 'create', '--title', `Phase-0: Research & Planning — ${opts.title || 'gate'}`, '--label', plan.child.labels.join(','), '--body', plan.child.bodyFor(epicNumber)]);
  execGh(['issue', 'edit', String(epicNumber), '--body', scaffold.buildEpicBody({ ...opts, childNumber })]);
  const check = scaffold.roundTripCheck({ epicLabels: plan.epic.labels, epicBody: scaffold.buildEpicBody({ ...opts, childNumber }), epicNumber, childNumber });
  const provenance = scaffold.provenanceRecord(epicNumber, childNumber, check.ok);
  log(provenance);
  if (!check.ok) throw new Error(`epic-scaffold: composition self-check FAILED — ${JSON.stringify(check.violations)}`);
  return { mode: 'apply', epicNumber, childNumber, roundTrip: check, provenance };
}

module.exports = { parseArgs, applyScaffold, defaultExecGh };

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.title) { console.error('Usage: node epic-scaffold-cli.js --title "..." [--area governance] [--priority P2] [--apply]'); process.exit(1); }
  applyScaffold(opts);
}
