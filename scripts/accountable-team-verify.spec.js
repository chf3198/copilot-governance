'use strict';

// Spec for accountable-team-verify (AT1–AT4). Node built-ins only; self-executing;
// exits non-zero on the first assertion failure so CI treats it as a hard test.
// Sibling-spec + registry entry added under #3806 (validator-discipline, #1893).

const assert = require('node:assert');
const {
  verifyTickets,
  parseMirrorTicket,
  NON_ACTIVE_STATES,
} = require('./accountable-team-verify');

// Helper: collect the set of warning codes for a single ticket.
function codesFor(ticket) {
  return verifyTickets([ticket]).warnings.map((w) => w.code);
}

// ── AT1 — malformed accountable-team value ───────────────────────────────────
assert.deepStrictEqual(
  codesFor({ file: '1.md', number: 1, type: 'task', status: 'OPEN', labels: ['accountable-team:bogus'] }).sort(),
  ['AT1_malformed_accountable_team'],
  'AT1: unknown team value must warn (and, having a label present, must NOT also AT4)',
);
assert.ok(
  !codesFor({ file: '2.md', number: 2, type: 'task', status: 'OPEN', labels: ['accountable-team:claude-code'] })
    .includes('AT1_malformed_accountable_team'),
  'AT1: a valid team value must not warn',
);

// ── AT2 — more than one accountable-team label ───────────────────────────────
assert.ok(
  codesFor({
    file: '3.md', number: 3, type: 'task', status: 'OPEN',
    labels: ['accountable-team:claude-code', 'accountable-team:copilot'],
  }).includes('AT2_multiple_accountable_team'),
  'AT2: two accountable-team labels must warn',
);

// ── AT3 — execution role on a terminal/backlog non-epic ticket ───────────────
assert.ok(
  codesFor({ file: '4.md', number: 4, type: 'task', status: 'DONE', labels: ['role:collaborator', 'accountable-team:codex'] })
    .includes('AT3_role_on_terminal'),
  'AT3: role:* on a DONE non-epic ticket must warn',
);
assert.ok(
  !codesFor({ file: '5.md', number: 5, type: 'epic', status: 'DONE', labels: ['role:manager', 'accountable-team:codex'] })
    .includes('AT3_role_on_terminal'),
  'AT3: Epics are exempt from the terminal-role check',
);

// ── AT4 — ownership coverage on active non-epic tickets ──────────────────────
// Fires: active status, non-epic, zero accountable-team labels.
assert.deepStrictEqual(
  codesFor({ file: '6.md', number: 6, type: 'task', status: 'OPEN', labels: ['role:collaborator'] }),
  ['AT4_active_ticket_no_owner'],
  'AT4: active non-epic ticket with no owner must warn (exactly once)',
);
// Does NOT fire when an owner is present.
assert.ok(
  !codesFor({ file: '7.md', number: 7, type: 'task', status: 'OPEN', labels: ['accountable-team:claude-code'] })
    .includes('AT4_active_ticket_no_owner'),
  'AT4: active ticket WITH an accountable owner must not warn',
);
// Does NOT fire on terminal/backlog states (that surface would be AT3 territory).
for (const term of NON_ACTIVE_STATES) {
  assert.ok(
    !codesFor({ file: '8.md', number: 8, type: 'task', status: term, labels: [] })
      .includes('AT4_active_ticket_no_owner'),
    `AT4: terminal/backlog state "${term}" must not warn on owner-coverage`,
  );
}
// Does NOT fire on Epics (ownership-exempt).
assert.ok(
  !codesFor({ file: '9.md', number: 9, type: 'epic', status: 'OPEN', labels: [] })
    .includes('AT4_active_ticket_no_owner'),
  'AT4: Epics are exempt from owner-coverage',
);
// Does NOT fire on empty/unknown status (parse gaps must not manufacture a gap).
assert.ok(
  !codesFor({ file: '10.md', number: 10, type: 'task', status: '', labels: [] })
    .includes('AT4_active_ticket_no_owner'),
  'AT4: empty status must not warn (avoid false owner-gap on parse gaps)',
);

// ── parseMirrorTicket wiring: an OPEN mirror ticket with no owner → AT4 ───────
const mirror = parseMirrorTicket('3799.md', [
  '---',
  'status: OPEN',
  '---',
  '> **Source** — **Labels**: type:task, priority:high',
].join('\n'));
assert.strictEqual(mirror.status, 'OPEN', 'parse: status frontmatter read');
assert.ok(
  codesFor(mirror).includes('AT4_active_ticket_no_owner'),
  'AT4 end-to-end: a parsed OPEN mirror ticket with no accountable-team label warns',
);

// ── Regression: a fully-clean active ticket produces no warnings ─────────────
assert.deepStrictEqual(
  verifyTickets([{ file: 'ok.md', number: 11, type: 'task', status: 'OPEN', labels: ['accountable-team:claude-code', 'role:collaborator'] }]).warnings,
  [],
  'clean active owned ticket → no warnings',
);

// ── Robustness: non-array input is tolerated ─────────────────────────────────
assert.deepStrictEqual(verifyTickets(null).warnings, [], 'null input → empty warnings');

console.log('accountable-team-verify.spec: all assertions passed (AT1–AT4).');
