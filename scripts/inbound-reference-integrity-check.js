'use strict';
// inbound-reference-integrity-check (#3419, Epic #3398 C1) — issues.closed Action.
// Sibling to epic-close-readiness-check.js (outbound); scans INBOUND refs to the
// closing ticket in other live OPEN issues and routes dangling pointers into the
// baton: a Manager-triage correction task + a BLOCKER_NOTE + an incidents.jsonl
// event (pattern_id: inbound-reference-orphan). Deterministic $0; no model calls.
const lib = require('./inbound-reference-integrity');
const store = require('./incidents-store');

const MARKER = '<!-- inbound-reference-integrity -->';

/**
 * Page all OPEN issues (number/title/body) via GraphQL.
 * @param {object} github - octokit client with a `graphql` method.
 * @param {string} owner - repo owner.
 * @param {string} repo - repo name.
 * @returns {Promise<Array<{number:number,title:string,body:string}>>} open issue nodes.
 */
async function listOpenIssues(github, owner, repo) {
  const gql = 'query($owner:String!,$repo:String!,$after:String){repository(owner:$owner,name:$repo)'
    + '{issues(first:100,states:OPEN,after:$after){nodes{number title body} pageInfo{hasNextPage endCursor}}}}';
  let after = null; const nodes = [];
  for (;;) {
    const data = await github.graphql(gql, { owner, repo, after });
    const block = data.repository.issues; nodes.push(...block.nodes);
    if (!block.pageInfo.hasNextPage) return nodes;
    after = block.pageInfo.endCursor;
  }
}

/**
 * Idempotency guard: has a re-home correction task for #closing already been filed?
 * @param {object} github - octokit client with `rest.search`.
 * @param {string} owner - repo owner.
 * @param {string} repo - repo name.
 * @param {number} closing - the closed ticket number.
 * @returns {Promise<boolean>} true when a matching correction task exists.
 */
async function alreadyFiled(github, owner, repo, closing) {
  const searchQuery = `Re-home orphaned reference to #${closing} in:title repo:${owner}/${repo}`;
  const result = await github.rest.search.issuesAndPullRequests({ q: searchQuery }).catch(() => ({ data: { total_count: 0 } }));
  return (result.data.total_count || 0) > 0;
}

/**
 * Render orphan findings as markdown bullet lines.
 * @param {Array<{from:number,form:string,cls:string,line:string}>} orphans - findings.
 * @returns {string} newline-joined bullet list.
 */
function orphanLines(orphans) {
  return orphans.map((o) => `- #${o.from} (${o.form}/${o.cls}): \`${o.line}\``).join('\n');
}

/**
 * issues.closed entry point: detect inbound orphans and route them into the baton.
 * @param {{github:object,context:object,core:object}} ctx - github-script context.
 * @param {{now?:string,env?:string,appendIncident?:Function}} [opts] - test/DI seams.
 * @returns {Promise<object>} result summary `{orphans, filed?, correction?}`.
 */
async function run({ github, context, core }, opts = {}) {
  const { owner, repo } = context.repo;
  const closing = (context.issue && context.issue.number) || context.payload.issue.number;
  const nowIso = opts.now || new Date().toISOString();
  const items = (await listOpenIssues(github, owner, repo))
    .map((n) => ({ number: n.number, text: `${n.title || ''}\n${n.body || ''}` }));
  const orphans = lib.scanInbound(closing, items);
  if (!orphans.length) { core?.info?.(`inbound-reference-integrity: #${closing} clean`); return { orphans: [] }; }
  if (await alreadyFiled(github, owner, repo, closing)) { core?.info?.('correction task already filed'); return { orphans, filed: false }; }
  const task = lib.buildCorrectionTask(closing, orphans);
  const created = await github.rest.issues.create({ owner, repo, title: task.title, body: task.body, labels: task.labels });
  const note = `${MARKER}\n## BLOCKER_NOTE — inbound-reference-orphan\n#${closing} closed with dangling inbound pointer(s); `
    + `filed correction #${created.data.number}:\n${orphanLines(orphans)}`;
  await github.rest.issues.createComment({ owner, repo, issue_number: closing, body: note });
  (opts.appendIncident || store.append)(lib.buildIncident(closing, orphans, nowIso, opts.env || 'ci'));
  core?.warning?.(`inbound-reference-integrity: ${orphans.length} orphan(s), correction #${created.data.number}`);
  return { orphans, filed: true, correction: created.data.number };
}

module.exports = { run, listOpenIssues, alreadyFiled, orphanLines, MARKER };
