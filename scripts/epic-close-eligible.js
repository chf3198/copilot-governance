#!/usr/bin/env node
'use strict';
// epic-close-eligible (#3519, Epic #3517 T-F1 / ADR-020 §D1) — the POSITIVE close-eligibility
// resurfacing signal that complements the #3350 close-time veto. Surface-only invariant I0:
// this NEVER closes an epic; it only applies signal:close-eligible + pings the owner. Any
// detection degradation FAILS CLOSED (no signal) — closing the #3354 sub_issues fails-open trap.

const SIGNAL_LABEL = 'signal:close-eligible';
const PENDING_MARKER = 'CLOSE_ELIGIBLE_PENDING'; // 2-sweep circuit-breaker arm
const APPLY_COMMENT = 'CLOSE_ELIGIBLE';
const CLEARED_COMMENT = 'CLOSE_ELIGIBLE_CLEARED';
const DEGRADED_INCIDENT = 'SUBISSUE_DETECT_DEGRADED';

// A child is terminal when its issue is CLOSED or it carries status:done|cancelled.
function isChildTerminal(child) {
  const state = String(child.state || '').toUpperCase();
  if (state === 'CLOSED') return true;
  const labels = (child.labels || []).map(l => (typeof l === 'string' ? l : l.name));
  return labels.includes('status:done') || labels.includes('status:cancelled');
}

// Pure decision core. facts:
//   childCount        number|null  — GraphQL sub_issues count (null = unknown/degraded)
//   terminalCount     number       — terminal children per GraphQL
//   restTerminalCount number|null  — REST timeline cross-check terminal count (null = errored)
//   labelPresent      bool         — signal:close-eligible currently on the epic
//   prevSweepEligible bool         — a CLOSE_ELIGIBLE_PENDING marker exists from the prior sweep
// Returns { action, ... }. action ∈ {no-op, pending, apply, debounce, clear}. NEVER closes.
function decideCloseEligible(facts = {}) {
  const { childCount, terminalCount, restTerminalCount, labelPresent, prevSweepEligible } = facts;
  const degraded = (reason) => ({ action: 'no-op', degraded: true, incident: DEGRADED_INCIDENT, reason });
  // Fail-closed: GraphQL child-count unknown (query errored / header dropped / null).
  if (childCount == null || typeof childCount !== 'number') return degraded('sub_issues child-count unknown — fail closed');
  // Fail-closed: REST cross-check errored, or the two sources disagree on terminal count (#3354 trap).
  if (restTerminalCount == null || restTerminalCount !== terminalCount) return degraded('REST cross-check errored/disagrees — fail closed');
  // Eligible: at least one child AND every child terminal.
  const eligible = childCount > 0 && terminalCount === childCount;
  if (!eligible) {
    return labelPresent
      ? { action: 'clear', label: SIGNAL_LABEL, comment: CLEARED_COMMENT, clearPending: true, reason: 'a child is open — auto-clear stale signal' }
      : { action: 'no-op', clearPending: true, reason: 'not all children terminal' };
  }
  // Debounce: the label already is the state.
  if (labelPresent) return { action: 'debounce', reason: 'already signalled close-eligible' };
  // Circuit-breaker: require two consecutive eligible sweeps before applying.
  if (!prevSweepEligible) return { action: 'pending', marker: PENDING_MARKER, reason: 'first eligible sweep — arm circuit-breaker' };
  return { action: 'apply', label: SIGNAL_LABEL, comment: APPLY_COMMENT, clearPending: true, reason: 'two consecutive eligible sweeps — apply signal' };
}

const SUBISSUES_QUERY = `
query EpicChildren($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      subIssues(first: 100) { nodes { number state labels(first: 20) { nodes { name } } } }
    }
  }
}`;

// Fetch children via GraphQL sub_issues WITH the required feature header (#3354 fails-open trap).
// Returns { childCount, terminalCount, numbers } or { childCount: null } on any error/degradation.
async function fetchSubIssues(github, owner, repo, number) {
  try {
    const res = await github.graphql(SUBISSUES_QUERY, {
      owner, repo, number, headers: { 'GraphQL-Features': 'sub_issues' },
    });
    const nodes = res?.repository?.issue?.subIssues?.nodes;
    if (!Array.isArray(nodes)) return { childCount: null }; // header dropped / shape unexpected
    const children = nodes.map(n => ({ number: n.number, state: n.state,
      labels: (n.labels?.nodes || []).map(l => l.name) }));
    return { childCount: children.length,
      terminalCount: children.filter(isChildTerminal).length,
      numbers: children.map(c => c.number) };
  } catch { return { childCount: null }; } // catch-empty: degraded read -> fail closed (I0)
}

// REST cross-check: re-derive the terminal count for the SAME child set. Any error -> null (fail closed).
async function restTerminalCount(github, owner, repo, numbers) {
  try {
    const states = await Promise.all(numbers.map(n =>
      github.rest.issues.get({ owner, repo, issue_number: n })
        .then(r => isChildTerminal({ state: r.data.state, labels: r.data.labels }))));
    return states.filter(Boolean).length;
  } catch { return null; } // catch-empty: REST degraded -> fail closed
}

async function hasPendingMarker(github, owner, repo, number) {
  const { data } = await github.rest.issues.listComments({ owner, repo, issue_number: number, per_page: 100 });
  return data.some(c => (c.body || '').includes(PENDING_MARKER));
}

// Thin runner invoked by .github/workflows/epic-close-eligible.yml (mirrors the #3350 pattern).
async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  const dryRun = String(process.env.DRY_RUN || '') === 'true' || process.env.CLOSE_ELIGIBLE_DISABLED === '1';
  const epics = await github.paginate(github.rest.issues.listForRepo,
    { owner, repo, labels: 'type:epic', state: 'open', per_page: 100 });
  for (const epic of epics) {
    const epicNum = epic.number;
    const sub = await fetchSubIssues(github, owner, repo, epicNum);
    const rest = sub.childCount == null ? null : await restTerminalCount(github, owner, repo, sub.numbers || []);
    const labelPresent = (epic.labels || []).map(l => l.name || l).includes(SIGNAL_LABEL);
    const prevSweepEligible = sub.childCount == null ? false : await hasPendingMarker(github, owner, repo, epicNum);
    const decision = decideCloseEligible({
      childCount: sub.childCount, terminalCount: sub.terminalCount,
      restTerminalCount: rest, labelPresent, prevSweepEligible,
    });
    core.info(`epic #${epicNum}: ${decision.action} — ${decision.reason}`);
    if (dryRun) continue;
    await applyDecision({ github, owner, repo, number: epicNum, decision });
  }
}

async function applyDecision({ github, owner, repo, number, decision }) {
  const post = body => github.rest.issues.createComment({ owner, repo, issue_number: number, body });
  if (decision.action === 'apply') {
    await github.rest.issues.addLabels({ owner, repo, issue_number: number, labels: [SIGNAL_LABEL] });
    await post(`${APPLY_COMMENT}: epic #${number} — every child terminal → @manager review for close (surface-only; does not close).`);
  } else if (decision.action === 'clear') {
    await github.rest.issues.removeLabel({ owner, repo, issue_number: number, name: SIGNAL_LABEL }).catch(() => {}); // catch-empty: label already gone
    await post(`${CLEARED_COMMENT}: epic #${number} — a child reopened; clearing close-eligible.`);
  } else if (decision.action === 'pending') {
    await post(`<!-- ${PENDING_MARKER} -->\n${PENDING_MARKER}: epic #${number} — first eligible sweep; circuit-breaker armed (needs a second consecutive sweep).`);
  }
}

module.exports = {
  decideCloseEligible, isChildTerminal, run, fetchSubIssues, restTerminalCount, applyDecision,
  SIGNAL_LABEL, PENDING_MARKER, APPLY_COMMENT, CLEARED_COMMENT, DEGRADED_INCIDENT,
};

if (require.main === module) {
  console.log(JSON.stringify(decideCloseEligible(JSON.parse(process.argv[2] || '{}')), null, 2));
}
