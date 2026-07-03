'use strict';
// Pure helpers for consultant-checks.js — split out so tests can call the
// decision logic without shelling to gh/git. Side-effects live in the CLI
// wrapper; this module stays deterministic.

const decideGov002 = comments =>
  /MANAGER_HANDOFF/.test(comments) && /COLLABORATOR_HANDOFF/.test(comments) &&
  /ADMIN_HANDOFF/.test(comments) && /CONSULTANT_CLOSEOUT/.test(comments);

const decideGov003 = (fleetLog, eventLog) =>
  /baton:/.test(fleetLog) || /"type":"baton:handoff"/.test(eventLog);

const decideGov005 = issueBody => !/- \[ \]/.test(issueBody);

// #1615: lanes where no implementation branch or PR is expected
const ISSUE_ONLY_LANES = /lane:docs-research|lane:trivial|lane:no-code-remediation|type:epic/;
const isIssueOnlyLane = labels => ISSUE_ONLY_LANES.test(labels || '');

// #1241: events.jsonl / fleet-health.jsonl are runtime artifacts written by
// the main checkout; fresh worktrees never have them. When the worktree path
// is empty, fall through to the main checkout discovered via
// `git worktree list --porcelain` (same pattern as #1378's node_modules link).
function readWithMainFallback({ fs, path, run, cwdRoot, relPath }) {
  const localPath = path.join(cwdRoot, relPath);
  let content = '';
  try { content = fs.readFileSync(localPath, 'utf8'); } catch {}
  if (content) return content;
  const porcelain = run('git worktree list --porcelain') || '';
  const line = porcelain.split('\n').find(l => l.startsWith('worktree '));
  const mainRoot = line ? line.slice(9) : '';
  if (mainRoot && mainRoot !== cwdRoot) {
    try { content = fs.readFileSync(path.join(mainRoot, relPath), 'utf8'); } catch {}
  }
  return content;
}

module.exports = { decideGov002, decideGov003, decideGov005, readWithMainFallback, isIssueOnlyLane, ISSUE_ONLY_LANES };
