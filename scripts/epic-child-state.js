'use strict';
// Pure child-state logic for the Epic parent-close guard (#3350).
//
// Closes the gap where Epics #3021 / #2891 closed with open children that were
// linked ONLY via timeline cross-reference + body parent-assertion (`Refs Epic
// #N`) — a class the `issues.closed` backstop missed because it matched task-
// list / native-parent / `Parent:`-text edges only. This module adds the
// cross-ref edge, but counts it ONLY when the CHILD's own body asserts this
// epic as its parent, so it does NOT reintroduce the #1306 epic-body prose
// false-positive class (which matched `#N` mentions in the EPIC body).
//
// No IO: the workflow / hook that consumes this owns the GitHub API and is the
// only surface tested against the network.

// Body-prose parent-assertion forms — the #1432 convention. A child-side
// signal: the issue claims THIS epic as its parent.
const PARENT_ASSERTION_PATTERNS = [
  /Refs\s+Epic\s+#(\d+)/i,
  /Epic:\s*#(\d+)/i,
  /Parent:\s*#(\d+)/i,
];

/** True when childBody asserts `epicNum` as its parent via any prose form. */
function assertsParent(childBody, epicNum) {
  const text = String(childBody || '');
  for (const re of PARENT_ASSERTION_PATTERNS) {
    const match = re.exec(text);
    if (match && Number(match[1]) === Number(epicNum)) return true;
  }
  return false;
}

/**
 * Compute the open-child union for an epic.
 * @param epicNum   the epic issue number
 * @param candidates [{ number, title, state, body, nativeParent, inTaskList, parentText }]
 *   - inTaskList: child appears as a `- [ ] #N` task-list edge in the epic body
 *   - nativeParent: the child's GitHub Sub-issue parent number (or null)
 *   - parentText: a `Parent:`-text match label (or null)
 * @returns [{ number, title, why }] open children with the matching edge kind.
 */
function openChildUnion(epicNum, candidates) {
  const union = [];
  for (const child of candidates || []) {
    if (Number(child.number) === Number(epicNum)) continue;
    if (String(child.state).toLowerCase() !== 'open') continue;
    const nativeMatch =
      Number.isInteger(child.nativeParent) && child.nativeParent === Number(epicNum);
    const why = child.inTaskList ? 'task-list'
      : nativeMatch ? 'native-parent'
      : child.parentText ? child.parentText
      : assertsParent(child.body, epicNum) ? 'cross-ref+parent-assertion'
      : null;
    if (why) union.push({ number: child.number, title: child.title, why });
  }
  return union;
}

/**
 * Reconcile a CONSULTANT(_EPIC)_CLOSEOUT's children-terminal assertion against
 * live open-child state. A closeout present on an epic asserts the close is
 * valid (all children terminal); any open child falsifies it.
 * @returns { hasCloseout, mismatch, falselyAssertedClosed }
 *   falselyAssertedClosed: issue #s named near a terminal-claim keyword in the
 *   closeout that are in fact live-open (the #3021 false-claim class).
 */
function reconcileCloseoutAssertion({ closeoutBody = '', openChildNumbers = [] } = {}) {
  const openSet = new Set((openChildNumbers || []).map(Number));
  const hasCloseout = /CONSULTANT(_EPIC)?_CLOSEOUT/i.test(String(closeoutBody));
  const falselyAssertedClosed = [];
  if (hasCloseout) {
    const claimLines = String(closeoutBody)
      .split('\n')
      .filter(line => /(closed|terminal|done|complete)/i.test(line));
    for (const line of claimLines) {
      for (const m of line.matchAll(/#(\d+)/g)) {
        const num = Number(m[1]);
        if (openSet.has(num) && !falselyAssertedClosed.includes(num)) {
          falselyAssertedClosed.push(num);
        }
      }
    }
  }
  return { hasCloseout, mismatch: hasCloseout && openSet.size > 0, falselyAssertedClosed };
}

/**
 * Flap-safe reopen decision (AC4). Reopen at most once per close event, and
 * only after a re-check confirms children are STILL open (GitHub eventual
 * consistency). Zero open children at re-check means no reopen — this IS the
 * suppression for a deliberate re-close after terminalising children, so there
 * is no close-reopen loop.
 */
function decideReopen({ initialOpenCount = 0, recheckOpenCount = null, alreadyReopened = false } = {}) {
  if (alreadyReopened) return { reopen: false, reason: 'already-reopened-this-event' };
  if (initialOpenCount === 0) return { reopen: false, reason: 'no-open-children' };
  const confirmed = recheckOpenCount === null ? initialOpenCount : recheckOpenCount;
  if (confirmed === 0) return { reopen: false, reason: 'recheck-cleared-eventual-consistency' };
  return { reopen: true, reason: `confirmed-${confirmed}-open` };
}

/** Build a schema-v3 incidents.jsonl record for an invalid epic close. */
function buildIncidentRecord(epicNum, openChildren, isoTs) {
  const ts = isoTs || new Date().toISOString();
  return {
    ts,
    timestamp: ts,
    version: 3,
    service: 'epic-close-guard',
    env: 'ci',
    event: 'kill-switch-trip',
    severity: 'high',
    pattern_id: 'epic-closed-with-open-children',
    epic: Number(epicNum),
    open_children: openChildren.map(child => child.number),
    _summary: `Epic #${epicNum} closed with ${openChildren.length} open child(ren); auto-reopened`,
  };
}

module.exports = {
  PARENT_ASSERTION_PATTERNS,
  assertsParent,
  openChildUnion,
  reconcileCloseoutAssertion,
  decideReopen,
  buildIncidentRecord,
};
