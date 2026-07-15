#!/usr/bin/env node
// slsa-verify.js — wraps `slsa-verifier verify-artifact` for runtime checks (#912).
// Used by hamr:doctor (#896) and the Worker /mcp route (#910 → #912).
'use strict';
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TIMEOUT_MS = 10000;
const SOURCE_URI = 'github.com/chf3198/megingjord-harness';
const OUTPUT_TRUNCATE = 500;

function which(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'pipe' }); return true; } catch { return false; }
}

/** Verify a SLSA-L3 attestation against an artifact.
 * @param {string} artifactPath - Bundle file path.
 * @param {string} provenancePath - Attestation file path (SLSA generator output).
 * @param {object} [options] - sourceUri, sourceTag.
 * @returns {{ok: boolean, reason?: string, output?: string, slsa_verifier_present?: boolean}} Result.
 */
function verifyArtifact(artifactPath, provenancePath, options = {}) {
  if (!which('slsa-verifier')) {
    return { ok: false, reason: 'slsa_verifier_not_installed', slsa_verifier_present: false };
  }
  if (!fs.existsSync(artifactPath)) return { ok: false, reason: 'artifact_not_found' };
  if (!fs.existsSync(provenancePath)) return { ok: false, reason: 'provenance_not_found' };
  const args = [
    'verify-artifact', artifactPath,
    '--provenance-path', provenancePath,
    '--source-uri', options.sourceUri ?? SOURCE_URI,
  ];
  if (options.sourceTag) args.push('--source-tag', options.sourceTag);
  const result = spawnSync('slsa-verifier', args, { timeout: TIMEOUT_MS, encoding: 'utf8' });
  if (result.status === 0) {
    return { ok: true, output: (result.stdout || '').trim().slice(0, OUTPUT_TRUNCATE), slsa_verifier_present: true };
  }
  return {
    ok: false,
    reason: result.signal === 'SIGTERM' ? 'timeout' : `verifier_exit_${result.status ?? 'unknown'}`,
    output: ((result.stdout || '') + (result.stderr || '')).trim().slice(0, OUTPUT_TRUNCATE),
    slsa_verifier_present: true,
  };
}

/** Verify a Cosign Bundle 1.0 signature on an artifact.
 * @param {string} artifactPath - Bundle file path.
 * @param {string} cosignBundlePath - Cosign bundle file (.cosign.bundle).
 * @returns {{ok: boolean, reason?: string, output?: string}} Result.
 */
function verifyCosign(artifactPath, cosignBundlePath) {
  if (!which('cosign')) return { ok: false, reason: 'cosign_not_installed' };
  if (!fs.existsSync(artifactPath)) return { ok: false, reason: 'artifact_not_found' };
  if (!fs.existsSync(cosignBundlePath)) return { ok: false, reason: 'cosign_bundle_not_found' };
  const result = spawnSync('cosign', [
    'verify-blob',
    '--bundle', cosignBundlePath,
    '--certificate-identity-regexp', '.*github.com/chf3198/megingjord-harness.*',
    '--certificate-oidc-issuer', 'https://token.actions.githubusercontent.com',
    artifactPath,
  ], { timeout: TIMEOUT_MS, encoding: 'utf8' });
  if (result.status === 0) return { ok: true, output: (result.stdout || '').trim().slice(0, OUTPUT_TRUNCATE) };
  return { ok: false, reason: `cosign_exit_${result.status ?? 'unknown'}`, output: ((result.stdout || '') + (result.stderr || '')).trim().slice(0, OUTPUT_TRUNCATE) };
}

function main() {
  const [, , cmd, artifact, attest, ...rest] = process.argv;
  if (!cmd || !['slsa', 'cosign'].includes(cmd)) {
    console.error('usage: slsa-verify.js <slsa|cosign> <artifact> <attestation>'); process.exit(1);
  }
  const result = cmd === 'slsa' ? verifyArtifact(artifact, attest) : verifyCosign(artifact, attest);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}

if (require.main === module) main();
module.exports = { verifyArtifact, verifyCosign, which };
