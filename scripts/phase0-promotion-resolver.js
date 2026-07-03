'use strict';
// phase0-promotion-resolver — GitHub data layer for the Phase-0 -> Phase-1
// promotion gate (Epic #2678). Resolves an Epic's labels, comments, and
// validated children into the shape phase0GreenComplete() consumes.
//
// Sub-issues API is unavailable on this repo plan (per #2679), so child
// linkage is candidate-#N refs (Epic body + EPIC_RESCOPE comment tables)
// filtered by a back-reference check: a candidate is only a child if it
// carries a phase-gate label AND its own body references this Epic. The
// back-ref filter stops unrelated #N mentions (e.g. a "Refs #3256" note in an
// analysis comment) from being mis-counted as Phase-0/Phase-1 children.

const { phase0GreenComplete } = require('./megalint/phase0-promotion-gate.js');

const MAX_CANDIDATES = 80;

function parseRefs(text) {
  return [...new Set((String(text || '').match(/#(\d+)/g) || []).map((m) => Number(m.slice(1))))];
}

function collectCandidateRefs(epic, comments, epicNumber) {
  const fromBody = parseRefs(epic && epic.body);
  const fromComments = (comments || []).flatMap((c) => parseRefs(c && c.body));
  return [...new Set([...fromBody, ...fromComments])]
    .filter((n) => n !== epicNumber)
    .slice(0, MAX_CANDIDATES);
}

function childBackrefsEpic(childBody, epicNumber) {
  if (parseRefs(childBody).includes(epicNumber)) return true;
  return new RegExp(`\\bParent:\\s*#${epicNumber}\\b`).test(String(childBody || ''));
}

function hasPhaseGateLabel(labels) {
  return labels.includes('phase-gate:phase-1') || labels.includes('phase-gate:research-first');
}

async function loadChild(github, owner, repo, n, epicNumber) {
  const data = (await github.rest.issues.get({ owner, repo, issue_number: n })).data;
  const labels = (data.labels || []).map((l) => l.name);
  if (!hasPhaseGateLabel(labels)) return null;
  if (!childBackrefsEpic(data.body, epicNumber)) return null;
  // Only Phase-0 (research-first, non-phase-1) children need comments (closeout check).
  let comments = [];
  if (labels.includes('phase-gate:research-first') && !labels.includes('phase-gate:phase-1')) {
    comments = await github.paginate(github.rest.issues.listComments, {
      owner, repo, issue_number: n, per_page: 100,
    });
  }
  return { number: n, state: data.state, labels, comments };
}

async function resolve({ github, owner, repo, epicNumber }) {
  const epic = (await github.rest.issues.get({ owner, repo, issue_number: epicNumber })).data;
  const labels = (epic.labels || []).map((l) => l.name);
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number: epicNumber, per_page: 100,
  });
  const refs = collectCandidateRefs(epic, comments, epicNumber);
  const children = [];
  for (const n of refs) {
    try {
      const child = await loadChild(github, owner, repo, n, epicNumber);
      if (child) children.push(child);
    } catch (e) {
      // candidate may be a PR, deleted issue, or cross-repo ref — skip it.
    }
  }
  const result = phase0GreenComplete({ labels, comments, children });
  return { epicNumber, children, ...result };
}

module.exports = {
  resolve, parseRefs, collectCandidateRefs, childBackrefsEpic, hasPhaseGateLabel,
};
