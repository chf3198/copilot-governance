#!/usr/bin/env node
// accountable-team.spec.js — regression suite for the ownership/baton-separation model.
// Epic #2345 AC6 (schema #2347, migration #2349, advisory validator #2348) — design #2346.
// Test runner: Node built-in assert (no external deps). Run: node scripts/global/accountable-team.spec.js
'use strict';

const assert = require('assert');
const {
  ACCOUNTABLE_TEAMS,
  ACCOUNTABLE_TEAM_LABEL_PREFIX,
  DEFAULT_ACCOUNTABLE_TEAM,
  ACCOUNTABLE_TEAM_AUTHORITY,
  isValidAccountableTeam,
  canModifyAccountableTeam,
  teamFromLabel,
  teamFromSigningBlock,
  resolveAccountableTeam,
} = require('./accountable-team');
const { deriveBackfill } = require('./accountable-team-backfill');
const { verifyTickets, parseMirrorTicket } = require('./accountable-team-verify');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failed++; }
}

// ── schema / validity ────────────────────────────────────────────────────────
test('known teams validate; unknown/empty do not', () => {
  for (const t of ACCOUNTABLE_TEAMS) assert.ok(isValidAccountableTeam(t));
  assert.ok(isValidAccountableTeam('COPILOT'), 'case-insensitive');
  assert.ok(!isValidAccountableTeam('acme'));
  assert.ok(!isValidAccountableTeam(''));
  assert.ok(!isValidAccountableTeam(null));
});

test('authority is limited to manager/admin and decoupled from other roles', () => {
  assert.deepStrictEqual([...ACCOUNTABLE_TEAM_AUTHORITY].sort(), ['admin', 'manager']);
  assert.ok(canModifyAccountableTeam('manager'));
  assert.ok(canModifyAccountableTeam('Admin'));
  assert.ok(!canModifyAccountableTeam('collaborator'));
  assert.ok(!canModifyAccountableTeam('consultant'));
});

test('teamFromLabel parses only well-formed accountable-team:* labels', () => {
  assert.strictEqual(teamFromLabel(`${ACCOUNTABLE_TEAM_LABEL_PREFIX}copilot`), 'copilot');
  assert.strictEqual(teamFromLabel('accountable-team:acme'), null, 'unknown team → null');
  assert.strictEqual(teamFromLabel('role:manager'), null, 'foreign namespace → null');
  assert.strictEqual(teamFromLabel(''), null);
});

test('teamFromSigningBlock extracts the team from a Team&Model line', () => {
  assert.strictEqual(teamFromSigningBlock('Team&Model: claude-code:opus@local'), 'claude-code');
  assert.strictEqual(teamFromSigningBlock('Team&Model: copilot:gpt-5.3-codex@github'), 'copilot');
  assert.strictEqual(teamFromSigningBlock('no signing block here'), null);
});

// ── resolution order (synthesis #2346 § 4) ───────────────────────────────────
test('resolution prefers an explicit label over signing block over default', () => {
  const labelWins = resolveAccountableTeam(
    ['accountable-team:codex'],
    [{ body: 'Team&Model: copilot:x@y' }],
  );
  assert.deepStrictEqual(labelWins, { team: 'codex', source: 'label' });

  const blockWins = resolveAccountableTeam(
    ['priority:P1'],
    [{ body: 'Team&Model: copilot:x@y' }, { body: 'Team&Model: antigravity:x@y' }],
  );
  assert.deepStrictEqual(blockWins, { team: 'antigravity', source: 'signing-block' }, 'newest block wins');

  const dflt = resolveAccountableTeam([], []);
  assert.deepStrictEqual(dflt, { team: DEFAULT_ACCOUNTABLE_TEAM, source: 'default' });
});

// ── migration (backfill) ─────────────────────────────────────────────────────
test('deriveBackfill plans a label for untagged tickets and skips tagged ones', () => {
  const plan = deriveBackfill([
    { number: 10, labels: ['priority:P1'], comments: [{ body: 'Team&Model: copilot:x@y' }] },
    { number: 11, labels: ['accountable-team:codex'], comments: [] },
    { number: 12, labels: [], comments: [] },
  ]);
  assert.strictEqual(plan.length, 2, '#11 already tagged is skipped');
  assert.deepStrictEqual(plan[0], { number: 10, addLabel: 'accountable-team:copilot', source: 'signing-block' });
  assert.deepStrictEqual(plan[1], { number: 12, addLabel: `accountable-team:${DEFAULT_ACCOUNTABLE_TEAM}`, source: 'default' });
});

test('deriveBackfill is idempotent (re-running over its own output is a no-op)', () => {
  const first = deriveBackfill([{ number: 20, labels: [], comments: [] }]);
  const nowTagged = [{ number: 20, labels: [first[0].addLabel], comments: [] }];
  assert.strictEqual(deriveBackfill(nowTagged).length, 0);
});

// ── advisory invariants (#2348) ──────────────────────────────────────────────
test('AT3: terminal non-epic ticket with a role:* label warns; epic is exempt', () => {
  const { warnings } = verifyTickets([
    { file: '100.md', number: 100, type: 'task', status: 'done', labels: ['role:consultant'] },
    { file: '101.md', number: 101, type: 'epic', status: 'done', labels: ['role:consultant'] },
    { file: '102.md', number: 102, type: 'task', status: 'in-progress', labels: ['role:collaborator'] },
  ]);
  const at3 = warnings.filter((w) => w.code === 'AT3_role_on_terminal').map((w) => w.number);
  assert.deepStrictEqual(at3, [100], 'only the terminal non-epic ticket warns');
});

test('AT1/AT2: malformed and duplicate accountable-team labels warn', () => {
  const { warnings } = verifyTickets([
    { file: '200.md', number: 200, type: 'task', status: 'done', labels: ['accountable-team:acme'] },
    { file: '201.md', number: 201, type: 'task', status: 'done', labels: ['accountable-team:copilot', 'accountable-team:codex'] },
  ]);
  assert.ok(warnings.some((w) => w.code === 'AT1_malformed_accountable_team' && w.number === 200));
  assert.ok(warnings.some((w) => w.code === 'AT2_multiple_accountable_team' && w.number === 201));
});

test('a clean corpus produces zero warnings', () => {
  const { warnings } = verifyTickets([
    { file: '300.md', number: 300, type: 'task', status: 'done', labels: ['accountable-team:copilot'] },
    { file: '301.md', number: 301, type: 'epic', status: 'open', labels: ['type:epic', 'role:manager'] },
    { file: '302.md', number: 302, type: 'task', status: 'in-progress', labels: ['role:collaborator', 'accountable-team:claude-code'] },
  ]);
  assert.deepStrictEqual(warnings, []);
});

test('parseMirrorTicket extracts number, status, type, and labels from a mirror page', () => {
  const txt = [
    '---', 'status: CLOSED', '---',
    '# #402 — Some ticket',
    '> **Source**: github:issue/402 | **state: CLOSED** | **Labels**: type:task, status:done, accountable-team:codex',
  ].join('\n');
  const t = parseMirrorTicket('402.md', txt);
  assert.strictEqual(t.number, 402);
  assert.strictEqual(t.status, 'CLOSED');
  assert.strictEqual(t.type, 'task');
  assert.ok(t.labels.includes('accountable-team:codex'));
});

console.log(`\naccountable-team.spec: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
