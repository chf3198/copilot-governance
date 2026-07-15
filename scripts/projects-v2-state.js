'use strict';
// projects-v2-state (#1648) — pure helper for cross-team Projects v2 board ops.
// All GraphQL routed through injected client; testable; honors MEGINGJORD_PROJECTS_V2_DISABLED.

function disabled(env = process.env) {
  return env.MEGINGJORD_PROJECTS_V2_DISABLED === '1';
}

async function setField(client, { projectId, itemId, fieldId, value }) {
  if (!projectId || !itemId || !fieldId) throw new Error('projectId, itemId, fieldId required');
  return client.graphql(`
    mutation Set($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value
      }) { projectV2Item { id } }
    }`, { projectId, itemId, fieldId, value });
}

async function setClaim(client, ctx, team) {
  if (disabled()) return { skipped: 'opt-out' };
  await setField(client, { ...ctx, fieldId: ctx.fields.claimedBy, value: { text: team } });
  return setField(client, { ...ctx, fieldId: ctx.fields.inFlightSince, value: { date: new Date().toISOString().slice(0, 10) } });
}

async function releaseClaim(client, ctx) {
  if (disabled()) return { skipped: 'opt-out' };
  return setField(client, { ...ctx, fieldId: ctx.fields.claimedBy, value: { text: '' } });
}

async function listInFlight(client, projectId) {
  if (disabled()) return [];
  const result = await client.graphql(`
    query InFlight($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 { items(first: 100) { nodes { id content { ... on Issue { number title } } } } }
      }
    }`, { projectId });
  return (result?.node?.items?.nodes) || [];
}

async function addLockedPath(client, ctx, path) {
  if (disabled()) return { skipped: 'opt-out' };
  return setField(client, { ...ctx, fieldId: ctx.fields.lockedPaths, value: { text: path } });
}

module.exports = { setClaim, releaseClaim, listInFlight, addLockedPath, setField, disabled };
