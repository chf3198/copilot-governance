#!/usr/bin/env node
// emit-event.js — Append a structured event to .dashboard/events.jsonl
// Global utility: deploy to ~/.copilot/scripts/ via npm run deploy:apply
// Usage: node emit-event.js --type ticket:status --issue 35 --role manager --agent "Manny Scope" --detail "Created epic"

const fs = require('fs');
const path = require('path');

function findRepoRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return start;
}

function parseArgs(argv) {
  // Support JSON as first argument: node emit-event.js '{"type":...}'
  if (argv[2] && argv[2].startsWith('{')) {
    try { return JSON.parse(argv[2]); } catch { /* fall through */ }
  }
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1] || '';
  }
  return args;
}

function emit(args) {
  const root = findRepoRoot(process.cwd());
  const dir = path.join(root, '.dashboard');
  const file = path.join(dir, 'events.jsonl');

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const event = {
    ts: new Date().toISOString(),
    type: args.type || 'system',
    issue: args.issue ? Number(args.issue) : null,
    role: args.role || null,
    agent: args.agent || null,
    model: args.model || null,
    title: args.title || null,
    epic: args.epic ? Number(args.epic) : null,
    status: args.status || null,
    detail: args.detail || '',
  };

  fs.appendFileSync(file, JSON.stringify(event) + '\n');
  if (!args.quiet) {
    console.log(JSON.stringify(event));
  }
  return event;
}

// CLI mode
if (require.main === module) {
  const args = parseArgs(process.argv);
  emit(args);
}

// Module mode — importable by other scripts
module.exports = { emit, findRepoRoot };

// Convenience helpers for Agile lifecycle events
function emitTicket(issue, detail, agent) {
  return emit({ type: 'ticket:created', issue, detail, agent });
}
function emitStatus(issue, status, agent) {
  return emit({ type: 'ticket:status', issue, detail: status, agent });
}
function emitRole(issue, role, agent) {
  return emit({ type: 'ticket:role', issue, role, agent, detail: role });
}
function emitBranch(issue, branch, agent) {
  return emit({ type: 'git:branch', issue, detail: branch, agent });
}
function emitPR(issue, pr, agent) {
  return emit({ type: 'git:pr', issue, detail: `PR #${pr}`, agent });
}
function emitMerge(issue, pr, agent) {
  return emit({ type: 'git:merge', issue, detail: `Merged #${pr}`, agent });
}
Object.assign(module.exports, {
  emitTicket, emitStatus, emitRole, emitBranch, emitPR, emitMerge
});
