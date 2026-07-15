'use strict';
// sub-issue-migrate (#1657) — one-time migration. Walks closed Epics with
// "Refs Epic #N" prose and emits Sub-issue links. Dry-run by default.

const REFS_EPIC_RE = /^Refs\s+Epic\s+#(\d+)\s*$/im;

function extractRefsEpic(body) {
  const match = (body || '').match(REFS_EPIC_RE);
  return match ? parseInt(match[1], 10) : null;
}

function plan(closedChildren) {
  const proposals = [];
  for (const child of (closedChildren || [])) {
    const parentNumber = extractRefsEpic(child.body);
    if (parentNumber) {
      proposals.push({
        action: 'addSubIssue',
        parent: parentNumber,
        child: child.number,
        parentNodeId: null,
        childNodeId: child.id,
      });
    }
  }
  return proposals;
}

async function execute(client, owner, repo, proposals, { dryRun = true } = {}) {
  const results = [];
  for (const proposal of proposals) {
    if (dryRun) {
      results.push({ ...proposal, status: 'dry-run' });
      continue;
    }
    const parentLookup = await client.graphql(
      'query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){issue(number:$number){id}}}',
      { owner, repo, number: proposal.parent }
    );
    const parentNodeId = parentLookup?.repository?.issue?.id;
    if (!parentNodeId) { results.push({ ...proposal, status: 'parent-not-found' }); continue; }
    try {
      await client.graphql(
        'mutation($issueId:ID!,$subId:ID!){addSubIssue(input:{issueId:$issueId,subIssueId:$subId}){subIssue{number}}}',
        { issueId: parentNodeId, subId: proposal.childNodeId }
      );
      results.push({ ...proposal, status: 'linked' });
    } catch (error) {
      results.push({ ...proposal, status: 'error', error: error.message });
    }
  }
  return results;
}

module.exports = { extractRefsEpic, plan, execute, REFS_EPIC_RE };
