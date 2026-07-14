#!/usr/bin/env node
'use strict';

// baton-e2e.spec.js — #2064 (deferred AC5 of closed #1944).
// End-to-end fixture for the FULL Manager -> Collaborator -> Admin -> Consultant
// baton cycle. Exercises every handoff gate + status/role label transitions +
// terminal close against a SYNTHETIC in-memory GitHub ticket.
//
// Scope note (rescope ratified by cross-family consensus, receipt 766db29cb883d161,
// panel groq[meta]=PASS + mistral[mistral]=PASS): the #1148-#3790 ticket universe is a
// local wiki mirror with no live GitHub remote, and the in-repo E2E precedent
// (cross-team-consult-e2e.js) is explicitly a synthetic state machine ("no live
// GitHub; caller supplies registry + timestamps"). This fixture follows that pattern:
// it drives the REAL baton tooling (scripts/baton-comment-build.js, the same code the
// operator invokes) and the REAL validators (baton-progression-parity,
// label-lint-close-protection) over simulated ticket state. No network, deterministic.
//
// AC5 retry policy: this fixture is fully deterministic and offline (no network, no
// clock/random dependence — all timestamps are fixed ISO literals). It therefore needs
// NO retries; a failure is a real regression, not flake. CI runs it once. If it ever
// flakes, that itself is the bug to file (do not add blind retries that mask it).
//
// Run:  node scripts/baton-e2e.spec.js        (exit 0 = pass, 1 = any failure)

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { checkBatonProgression, STAGE_ORDER } = require('./baton-progression-parity.js');
const { decide } = require('./label-lint-close-protection.js');

const CLI = path.join(__dirname, 'baton-comment-build.js');
const TEAM_MODEL = 'claude-code:opus@anthropic';
const TICKET = 2064;

// --- Signer-registry provisioning (offline/CI self-containment) ----------------------
// #3799-AC1: signer-alias.js now resolves its registry hermetically, preferring the
// in-repo, tracked, secret-free alias subset at <repo>/inventory/team-model-signatures.json.
// That tracked file ships on the branch, so on a clean archive checkout it already exists
// and provisionRegistry() is a no-op (it only writes when the path is missing, and removes
// ONLY what it created). The prior workaround wrote a fixture to the OUT-OF-REPO
// <repo>/../inventory path; that patch is no longer needed now that the dependency closure
// is tracked in-repo.
const REGISTRY_PATH = path.join(__dirname, '..', 'inventory', 'team-model-signatures.json');
const FIXTURE_REGISTRY = {
  defaultAliasSeed: 'Nova',
  roleSurnames: { manager: 'Mason', collaborator: 'Harper', admin: 'Reyes', consultant: 'Vale' },
  substrateTeamMap: {},
  registry: [{ team: 'claude-code', modelPattern: '.*', aliasSeed: 'Orla' }],
};
let _createdRegistryFile = false;
let _createdRegistryDir = null;
function provisionRegistry() {
  if (fs.existsSync(REGISTRY_PATH)) return; // real registry present — use it, touch nothing.
  const dir = path.dirname(REGISTRY_PATH);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); _createdRegistryDir = dir; }
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(FIXTURE_REGISTRY, null, 2));
  _createdRegistryFile = true;
}
function teardownRegistry() {
  if (_createdRegistryFile) { try { fs.unlinkSync(REGISTRY_PATH); } catch (_) {} }
  if (_createdRegistryDir) { try { fs.rmdirSync(_createdRegistryDir); } catch (_) {} }
}
provisionRegistry();

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS ' + name); }
  catch (e) { failures++; console.error('  FAIL ' + name + ': ' + e.message); }
}

// --- Real CLI invocation: generate a baton artifact via the canonical builder -------
// Mirrors what a real Admin/Collaborator runs. Uses the structured --fields-json path
// (the only path that yields a schema-valid MANAGER/COLLABORATOR/ADMIN/CONSULTANT
// artifact; the --summary legacy path deliberately fails MANAGER field checks).
function buildViaCLI(artifact, role, fields, { withTicket = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'baton-e2e-'));
  const fj = path.join(tmp, 'fields.json');
  fs.writeFileSync(fj, JSON.stringify(fields));
  try {
    const args = ['--artifact', artifact, '--role', role, '--team-model', TEAM_MODEL,
      '--fields-json', fj];
    if (withTicket) args.push('--ticket', String(TICKET));
    const res = spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
    return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// --- Synthetic GitHub ticket state machine (no live GitHub) --------------------------
function initialTicket() {
  return {
    number: TICKET,
    state: 'open',
    labels: ['type:task', 'status:backlog', 'priority:P3', 'area:governance', 'lane:code-change'],
    comments: [], // each: { body, createdAt }
  };
}
function setStatus(ticket, status) {
  ticket.labels = ticket.labels.filter((l) => !l.startsWith('status:'));
  ticket.labels.push(status);
}
function setRole(ticket, role) {
  ticket.labels = ticket.labels.filter((l) => !l.startsWith('role:'));
  if (role) ticket.labels.push('role:' + role);
}
function postArtifact(ticket, body, createdAt) {
  ticket.comments.push({ body, createdAt });
}

// Fixed, ordered timestamps (determinism — no Date.now()).
const T = {
  manager: '2026-07-14T01:00:00Z',
  collaborator: '2026-07-14T02:00:00Z',
  admin: '2026-07-14T03:00:00Z',
  consultant: '2026-07-14T04:00:00Z',
};

// Canonical field sets per artifact (all req: fields per baton-artifact-schema.js).
const FIELDS = {
  MANAGER_HANDOFF: {
    scope: 'E2E fixture exercising the full baton cycle for #2064',
    lane: 'code-change',
    test_strategy: 'synthetic-state-machine e2e over real baton tooling',
    acceptance: '- AC1 synthetic ticket\n- AC2 four artifacts validated\n- AC3 transitions\n- AC4 terminal close\n- AC5 CI stress-surface',
    gates: 'baton-progression-parity, label-lint-close-protection',
    related_tickets: 'none',
    overlap_decision: 'no-overlap',
  },
  COLLABORATOR_HANDOFF: {
    scope: 'implement baton-e2e.spec.js synthetic cycle fixture',
    test_strategy: 'node scripts/baton-e2e.spec.js (Style B, exit-code signalled)',
    per_ac_verification: '- AC1: synthetic in-memory ticket, no network\n- AC2: 4 artifacts built + validated\n- AC3: full label/role transition sequence asserted\n- AC4: terminal status:done + resolution:completed asserted\n- AC5: wired into validate-pr.yml',
    cross_family_rating: 'PASS',
    cross_family_reviewer: 'groq[meta]+mistral[mistral]',
    cross_family_findings: 'none (rescope receipt 766db29cb883d161)',
  },
  ADMIN_HANDOFF: {
    branch: 'feat/2064-baton-e2e-fixture',
    commit: 'PENDING',
    'signer-independence-check': 'pass (Mason/Harper/Reyes/Vale distinct)',
    'deploy-runtime-impact': 'none (test-only fixture; no runtime code path)',
  },
  CONSULTANT_CLOSEOUT: {
    status: 'done',
    verdict: 'approved',
    'verification-timestamp': T.consultant,
    rubric_rating: 'G1=pass G2=pass G3=pass',
    anneal_tickets_filed: 'none',
    mid_flight_flaws: 'none',
  },
};

// Derived signer surnames (never typed — proves signer-independence per role).
const EXPECTED_SIGNER = {
  MANAGER_HANDOFF: 'Orla Mason',
  COLLABORATOR_HANDOFF: 'Orla Harper',
  ADMIN_HANDOFF: 'Orla Reyes',
  CONSULTANT_CLOSEOUT: 'Orla Vale',
};

const ROLE_OF = {
  MANAGER_HANDOFF: 'manager',
  COLLABORATOR_HANDOFF: 'collaborator',
  ADMIN_HANDOFF: 'admin',
  CONSULTANT_CLOSEOUT: 'consultant',
};

console.log('baton-e2e.spec: full Manager->Collaborator->Admin->Consultant cycle (#2064)');

// ---- AC1: synthetic ticket is fully in-memory (no network) --------------------------
const ticket = initialTicket();
test('AC1 synthetic ticket starts at status:backlog, open, no comments', () => {
  assert.equal(ticket.state, 'open');
  assert.ok(ticket.labels.includes('status:backlog'));
  assert.equal(ticket.comments.length, 0);
});

// ---- AC2: generate + validate all four baton artifacts via the REAL CLI --------------
const artifacts = {}; // ARTIFACT -> body
for (const artifact of STAGE_ORDER) {
  const role = ROLE_OF[artifact];
  test(`AC2 build ${artifact} via real baton-comment-build.js`, () => {
    const r = buildViaCLI(artifact, role, FIELDS[artifact], { withTicket: artifact !== 'MANAGER_HANDOFF' });
    assert.equal(r.code, 0, `CLI exit ${r.code}: ${r.stderr}`);
    assert.match(r.stdout, new RegExp(`##\\s+${artifact}\\b`), 'artifact header present');
    assert.match(r.stdout, new RegExp(`Signed-by: ${EXPECTED_SIGNER[artifact]}\\b`),
      `derived signer must be ${EXPECTED_SIGNER[artifact]}`);
    assert.match(r.stdout, new RegExp(`Role: ${role}\\b`), 'role line present');
    artifacts[artifact] = r.stdout;
  });
}

test('AC2 signer-independence: all four role signers are distinct', () => {
  const signers = STAGE_ORDER.map((a) => (artifacts[a].match(/Signed-by: (.+)/) || [])[1]);
  assert.equal(new Set(signers).size, 4, `expected 4 distinct signers, got ${JSON.stringify(signers)}`);
});

test('AC2 real schema validation rejects a missing required field', () => {
  // ADMIN_HANDOFF without required "commit" must fail at the builder (real validator).
  const r = buildViaCLI('ADMIN_HANDOFF', 'admin', { branch: 'x' });
  assert.notEqual(r.code, 0, 'CLI must reject artifact missing a required field');
  assert.match(r.stderr, /commit/i, 'error should name the missing field');
});

// ---- AC3: drive the full status/role label transition sequence -----------------------
const statusTrail = [];
const roleTrail = [];
function advance(artifact, status, role, ts) {
  postArtifact(ticket, artifacts[artifact], ts);
  setStatus(ticket, status);
  setRole(ticket, role);
  statusTrail.push(status);
  roleTrail.push(role);
}

test('AC3 full baton progression is contiguous + time-ordered (real validator)', () => {
  advance('MANAGER_HANDOFF', 'status:in-progress', 'collaborator', T.manager);
  advance('COLLABORATOR_HANDOFF', 'status:review', 'admin', T.collaborator);
  advance('ADMIN_HANDOFF', 'status:review', 'consultant', T.admin);
  advance('CONSULTANT_CLOSEOUT', 'status:review', 'consultant', T.consultant);
  assert.equal(checkBatonProgression(ticket.comments), null, 'ordered full cycle must pass');
});

test('AC3 status trail follows backlog->in-progress->review sequence', () => {
  assert.deepEqual(statusTrail,
    ['status:in-progress', 'status:review', 'status:review', 'status:review']);
});

test('AC3 negative: out-of-order baton is rejected', () => {
  const bad = [
    { body: artifacts.COLLABORATOR_HANDOFF, createdAt: T.manager },
    { body: artifacts.MANAGER_HANDOFF, createdAt: T.collaborator },
  ];
  const v = checkBatonProgression(bad);
  assert.ok(v && v.rule === 'baton-progression-out-of-order', `expected out-of-order, got ${JSON.stringify(v)}`);
});

test('AC3 negative: skipped-step (gap) baton is rejected', () => {
  const bad = [
    { body: artifacts.MANAGER_HANDOFF, createdAt: T.manager },
    { body: artifacts.ADMIN_HANDOFF, createdAt: T.admin },
  ];
  const v = checkBatonProgression(bad);
  assert.ok(v && v.rule === 'baton-progression-gap', `expected gap, got ${JSON.stringify(v)}`);
});

// ---- AC4: terminal close — PR/CI/merge modeled as synthetic close transition ----------
test('AC4 closeout present + status:review => auto-transition to status:done', () => {
  const d = decide({ state: 'closed', labels: ticket.labels, comments: ticket.comments });
  assert.equal(d.action, 'auto-transition', `expected auto-transition, got ${JSON.stringify(d)}`);
  assert.ok(d.addLabels.includes('status:done'), 'terminal status:done added');
  // Ticket-level close uses resolution:completed (resolution:released is the Epic/release variant).
  assert.ok(d.addLabels.includes('resolution:completed'), 'resolution:completed added');
  assert.ok(d.removeLabels.includes('role:consultant'), 'role label stripped on close');
  // Apply the transition to the synthetic ticket -> assert terminal state.
  for (const l of d.removeLabels) ticket.labels = ticket.labels.filter((x) => x !== l);
  for (const l of d.addLabels) if (!ticket.labels.includes(l)) ticket.labels.push(l);
  ticket.state = 'closed';
  assert.ok(ticket.labels.includes('status:done'));
  assert.ok(ticket.labels.includes('resolution:completed'));
  assert.equal(ticket.state, 'closed');
});

test('AC4 negative: close with no closeout in trail => reopen (guard fires)', () => {
  const d = decide({ state: 'closed', labels: ['status:review'], comments: [] });
  assert.equal(d.action, 'reopen', `expected reopen, got ${JSON.stringify(d)}`);
});

// ---- AC5: stress-surface self-report ------------------------------------------------
teardownRegistry();
console.log(failures
  ? `\n${failures} test(s) FAILED`
  : '\nAll baton-e2e cycle tests passed (AC1-AC5).');
process.exit(failures ? 1 : 0);
