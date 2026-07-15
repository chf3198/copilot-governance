'use strict';
// sub-issue-link (#1656) — pure helper exporting addSubIssue, removeSubIssue, listSubIssues.
// Uses GitHub GraphQL via injected client (testable).

const ADD_QUERY = `
mutation AddSubIssue($issueId: ID!, $subId: ID!) {
  addSubIssue(input: { issueId: $issueId, subIssueId: $subId }) {
    subIssue { id number title }
  }
}`;

const REMOVE_QUERY = `
mutation RemoveSubIssue($issueId: ID!, $subId: ID!) {
  removeSubIssue(input: { issueId: $issueId, subIssueId: $subId }) {
    issue { id number }
  }
}`;

const LIST_QUERY = `
query ListSubIssues($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      subIssues(first: 100) {
        nodes { id number title state }
      }
    }
  }
}`;

async function addSubIssue(client, parentNodeId, childNodeId) {
  if (!parentNodeId || !childNodeId) throw new Error('parent and child node IDs required');
  return client.graphql(ADD_QUERY, { issueId: parentNodeId, subId: childNodeId });
}

async function removeSubIssue(client, parentNodeId, childNodeId) {
  if (!parentNodeId || !childNodeId) throw new Error('parent and child node IDs required');
  return client.graphql(REMOVE_QUERY, { issueId: parentNodeId, subId: childNodeId });
}

async function listSubIssues(client, owner, repo, parentNumber) {
  if (!owner || !repo || !parentNumber) throw new Error('owner, repo, parentNumber required');
  const result = await client.graphql(LIST_QUERY, { owner, repo, number: parentNumber });
  return (result?.repository?.issue?.subIssues?.nodes) || [];
}

module.exports = { addSubIssue, removeSubIssue, listSubIssues, ADD_QUERY, REMOVE_QUERY, LIST_QUERY };
