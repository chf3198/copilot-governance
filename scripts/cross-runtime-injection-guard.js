#!/usr/bin/env node
'use strict';
// cross-runtime-injection-guard (#1936) — detectors for the residual CROSS-RUNTIME state-injection
// vectors the #3021 cluster left open. #3021 (#3033/#3035/#3036/#3037) hardened the LOCAL runtime only
// (atomic writes, local lease cache, local worktree preflight, local event attribution); it never
// validated cross-runtime env/artifact provenance or reconciled leases against the authoritative source.
//
// All detectors are pure + dependency-injected so the adversarial corpus runs with no network/registry.
// Vectors: (1) lease-state reconcile, (2) hook-context env trust, (4) baton-artifact sovereignty.
// Vector 3 (signer substrate-first) is exercised against signer-alias.js and caught at validation by the
// sovereignty enrollment check (defense-in-depth, no risky edit to the shared artifact builder).

const SAFE_SESSION_RE = /^[A-Za-z0-9._-]{1,64}$/;

// Vector 2 — hook-context env trust: Team A's hook env must not poison Team B. The asserted team must be
// an enrolled team and the session id must be a safe token (no injection payload / shell metacharacters).
function validateHookEnv(env = {}, opts = {}) {
  const knownTeams = (opts.knownTeams || []).map((team) => String(team).toLowerCase());
  const findings = [];
  const team = String(env.HAMR_TEAM || env.MEGINGJORD_TEAM || '').toLowerCase();
  if (!team) {
    findings.push({ vector: 'hook-context', id: 'hook-env-team-absent', severity: 'medium',
      detail: 'no HAMR_TEAM / MEGINGJORD_TEAM set' });
  } else if (knownTeams.length && !knownTeams.includes(team)) {
    findings.push({ vector: 'hook-context', id: 'hook-env-team-untrusted', severity: 'high',
      detail: `team "${team}" is not an enrolled team` });
  }
  const sessionId = env.MEGINGJORD_SESSION_ID;
  if (sessionId !== undefined && !SAFE_SESSION_RE.test(String(sessionId))) {
    findings.push({ vector: 'hook-context', id: 'hook-env-session-malformed', severity: 'high',
      detail: 'MEGINGJORD_SESSION_ID is not a safe token (possible injection)' });
  }
  return { ok: findings.length === 0, vector: 'hook-context', findings };
}

// Vector 4 — baton-artifact sovereignty: an artifact's team must match the PR's team, and the signer
// alias must be the registry-enrolled alias for (team, role). Catches a forged cross-team closeout and
// a forged-substrate signer (Vector 3) at the validation layer.
function validateArtifactSovereignty(artifact = {}, opts = {}) {
  const findings = [];
  const prTeam = String(opts.prTeam || '').toLowerCase();
  const artifactTeam = String(artifact.team || '').toLowerCase();
  if (prTeam && artifactTeam && artifactTeam !== prTeam) {
    findings.push({ vector: 'baton-artifact', id: 'artifact-team-mismatch', severity: 'high',
      detail: `artifact team "${artifactTeam}" does not match PR team "${prTeam}"` });
  }
  if (typeof opts.resolveEnrolledAlias === 'function') {
    const expected = opts.resolveEnrolledAlias(artifactTeam || prTeam, artifact.role, artifact.model);
    if (expected && artifact.signedBy && expected !== artifact.signedBy) {
      findings.push({ vector: 'baton-artifact', id: 'artifact-signer-not-enrolled', severity: 'high',
        detail: `signer "${artifact.signedBy}" is not the enrolled alias "${expected}" for ${artifactTeam}/${artifact.role}` });
    }
  }
  return { ok: findings.length === 0, vector: 'baton-artifact', findings };
}

// Vector 1 — lease-state reconcile: the local gate reads a LOCAL file, so Team A's lease in its own
// runtime home is invisible to Team B. Reconcile against the authoritative (GitHub-native) registry —
// authoritative wins — and flag any authoritative lease missing locally. authoritativeLeases is injected.
function leaseKey(lease) { return `${lease.ticket || ''}:${lease.team || ''}:${(lease.paths || []).join(',')}`; }

function reconcileLease(localLeases = [], authoritativeLeases = []) {
  const localKeys = new Set(localLeases.map(leaseKey));
  const findings = [];
  for (const lease of authoritativeLeases) {
    if (!localKeys.has(leaseKey(lease))) {
      findings.push({ vector: 'lease-state', id: 'lease-invisible-cross-runtime', severity: 'high',
        detail: `authoritative lease ${leaseKey(lease)} is not present in the local registry`, lease });
    }
  }
  return { ok: findings.length === 0, vector: 'lease-state', reconciled: [...authoritativeLeases], findings };
}

function auditAll(inputs = {}, opts = {}) {
  const results = [];
  if (inputs.env) results.push(validateHookEnv(inputs.env, opts));
  if (inputs.artifact) results.push(validateArtifactSovereignty(inputs.artifact, opts));
  if (inputs.localLeases || inputs.authoritativeLeases) {
    results.push(reconcileLease(inputs.localLeases || [], inputs.authoritativeLeases || []));
  }
  return { ok: results.every((r) => r.ok), findings: results.flatMap((r) => r.findings), results };
}

module.exports = { validateHookEnv, validateArtifactSovereignty, reconcileLease, auditAll, leaseKey, SAFE_SESSION_RE };

if (require.main === module) {
  // --self-test: run the committed adversarial corpus; pass only if EVERY forged case is detected and
  // EVERY clean case passes (zero false positives). Used by the harness:self-test registry (#1936 AC4).
  const fs = require('node:fs');
  const path = require('node:path');
  const corpus = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', '..', 'tests', 'fixtures', 'cross-runtime-injection-corpus.json'), 'utf8'));
  const enrolled = (team, role) => corpus.enrolledAliases[`${team}/${role}`] || null;
  const failures = [];
  for (const testCase of corpus.cases) {
    const out = auditAll(testCase.inputs, { ...testCase.opts, resolveEnrolledAlias: enrolled });
    const detected = out.findings.some((finding) => finding.vector === testCase.vector);
    if (testCase.forged && !detected) failures.push(`undetected forged: ${testCase.name}`);
    if (!testCase.forged && detected) failures.push(`false positive: ${testCase.name}`);
  }
  const result = { ok: failures.length === 0, total: corpus.cases.length, failures };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}
