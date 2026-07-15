'use strict';
// phase1-auto-materialize — auto-creates a Phase-1 seed child when a
// research-first Epic's Phase-0 goes green with zero Phase-1 children
// (Epic #2678 / AC2). Design #2679 Component B.
//
// Granularity decision (Manager, #2678): materialize ONE well-formed Phase-1
// seed/planning child rather than a speculative N-child bundle. This makes the
// #2661 silent-close gap impossible (a Phase-1 child always exists once
// Phase-0 is green) while honoring #3256's anti-sprawl / just-in-time-child
// concern. The Manager expands the seed into concrete implementation children.

const { resolve } = require('./phase0-promotion-resolver.js');
const { buildIncident } = require('./megalint/phase0-promotion-gate.js');
const incidents = require('./incidents-store.js');

function pickInherited(labels, prefix, fallback) {
  return (labels || []).find((l) => l.startsWith(prefix)) || fallback;
}

/** Pure: build the single Phase-1 seed child spec from the Epic. */
function buildPhase1Seed(epic) {
  const epicNumber = epic.number;
  const labels = (epic.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const area = pickInherited(labels, 'area:', 'area:governance');
  const priority = pickInherited(labels, 'priority:', 'priority:P2');
  const title = `Plan and implement Phase-1 deliverables for Epic #${epicNumber}`;
  const body = [
    `## Parent`, `Parent: #${epicNumber}`, '',
    `## Objective`,
    `Auto-materialized Phase-1 seed for research-first Epic #${epicNumber} (its Phase-0 reached green-complete with zero Phase-1 children). Created by phase1-auto-materialize per Epic #2678 to close the #2661 silent-close gap.`, '',
    `## Scope`,
    `Manager: decompose this seed into concrete just-in-time implementation children mapping to the Epic's remaining ACs, then progress them through the baton. Do not over-decompose (see #3256). Close this seed once real Phase-1 children exist or once it is itself implemented.`, '',
    `## Acceptance`,
    `- [ ] AC1: Epic #${epicNumber} Phase-1 implementation children authored (or this seed implemented directly)`,
    `- [ ] AC2: each maps to a remaining Epic AC and cites its Phase-0 source(s)`, '',
    `## References`, `Refs #${epicNumber}`,
  ].join('\n');
  return { title, body, labels: ['type:task', 'status:backlog', priority, area, 'phase-gate:phase-1', 'lane:code-change'] };
}

async function materialize({ github, owner, repo, epicNumber, dryRun = false, triggerRole = 'system' }) {
  const state = await resolve({ github, owner, repo, epicNumber });
  if (!state.applicable || !state.complete || !state.missingPhase1Children) {
    return { created: false, reason: state.details, state };
  }
  const epic = (await github.rest.issues.get({ owner, repo, issue_number: epicNumber })).data;
  const seed = buildPhase1Seed(epic);
  incidents.append(buildIncident(epicNumber, `${state.details}; auto-materializing seed`, triggerRole));
  if (dryRun) return { created: false, dryRun: true, seed, state };
  const issue = (await github.rest.issues.create({
    owner, repo, title: seed.title, body: seed.body, labels: seed.labels,
  })).data;
  await github.rest.issues.createComment({
    owner, repo, issue_number: epicNumber,
    body: `## PHASE1_AUTO_MATERIALIZED\nPhase-0 green-complete with zero Phase-1 children — seeded #${issue.number} (phase-gate:phase-1). Manager: expand into just-in-time implementation children. _Posted by phase1-auto-materialize (Epic #2678)._`,
  }).catch(() => {});
  return { created: true, child: issue.number, seed, state };
}

module.exports = { materialize, buildPhase1Seed, pickInherited };
