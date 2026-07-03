#!/usr/bin/env node
'use strict';
// verify-deploy.js (#2914): compare deployed runtime artifacts against a stored SHA-256 manifest.
// Exits 0 if all hashes match; exits 1 on any mismatch, missing file, symlink, or HMAC failure.
// Pre-deploy integrity check. Addresses Gap G-09, OWASP ASI07 + ASI10, EU AI Act Art.15.
//
// Security contract:
//   - Manifest path and target dir are lstat-checked to reject symlinks (CWE-59).
//   - Manifest HMAC is verified when DEPLOY_MANIFEST_HMAC_KEY is set (or REQUIRE_SIG=1).
//   - File hashing is delegated to hashFile (read-once buffer — no TOCTOU, CWE-367).
//   - Any malformed/unexpected input results in ok:false (fail-closed, CWE-754).
const fs = require('node:fs');
const path = require('node:path');
const { hashFile, collectFiles, verifyManifestHmac, MANIFEST_DIR, TARGET_DIRS, isDeployedPath } =
  require('./deploy-manifest');

/** @typedef {{ ok: boolean, mismatches: string[], missing: string[], extra: string[], manifest: object|null, error?: string }} VerifyResult */

/**
 * Read and lstat-validate the manifest file. Returns error result or { manifest, ok:true }.
 * @param {string} manifestPath absolute path to manifest JSON
 * @returns {VerifyResult|{ manifest: object }} error shape or parsed manifest
 */
function loadManifest(manifestPath) {
  let stat;
  try { stat = fs.lstatSync(manifestPath); } catch {
    return { ok: false, mismatches: [], missing: [], extra: [], manifest: null,
      error: `no manifest found at ${manifestPath} — run deploy-manifest first` };
  }
  if (stat.isSymbolicLink()) {
    return { ok: false, mismatches: [], missing: [], extra: [], manifest: null,
      error: `manifest path is a symlink — rejected (CWE-59): ${manifestPath}` };
  }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {
    return { ok: false, mismatches: [], missing: [], extra: [], manifest: null,
      error: 'manifest file could not be read or parsed as JSON' };
  }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.entries)) {
    return { ok: false, mismatches: [], missing: [], extra: [], manifest,
      error: 'manifest malformed: missing entries array' };
  }
  return { manifest };
}

/**
 * lstat-validate target directory. Returns error result or null when valid.
 * @param {string} targetDir absolute path to deployed directory
 * @returns {VerifyResult|null} error shape or null when directory is valid
 */
function checkTargetDir(targetDir) {
  let stat;
  try { stat = fs.lstatSync(targetDir); } catch {
    return { ok: false, mismatches: [], missing: [], extra: [], manifest: null,
      error: `target directory does not exist: ${targetDir}` };
  }
  if (stat.isSymbolicLink()) {
    return { ok: false, mismatches: [], missing: [], extra: [], manifest: null,
      error: `target directory is a symlink — rejected (CWE-59): ${targetDir}` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, mismatches: [], missing: [], extra: [], manifest: null,
      error: `target path is not a directory: ${targetDir}` };
  }
  return null;
}

/**
 * Compare expected manifest entries against actual files on disk.
 * @param {Map<string,string>} expectedMap relPath to expected sha256
 * @param {Map<string,string>} actualMap relPath to absolute path on disk
 * @returns {{ mismatches: string[], missing: string[], extra: string[] }} diff result
 */
function diffEntries(expectedMap, actualMap) {
  const mismatches = [];
  const missing = [];
  for (const [relPath, expectedHash] of expectedMap) {
    if (!actualMap.has(relPath)) { missing.push(relPath); continue; }
    const actual = hashFile(actualMap.get(relPath)); // read-once (no TOCTOU)
    if (actual !== expectedHash) mismatches.push(relPath);
  }
  const extra = [...actualMap.keys()].filter((p) => !expectedMap.has(p));
  return { mismatches, missing, extra };
}

/**
 * Load and verify the manifest, check target dir, and verify HMAC.
 * Arguments are pre-validated by verifyDeploy before this is called.
 * @param {string} targetDir absolute path to deployed directory (pre-validated)
 * @param {string} targetName logical name for error context
 * @param {string} manifestPath absolute path to manifest JSON file
 * @returns {{ error: VerifyResult, manifest: null } | { error: null, manifest: object }} result
 */
function prepareVerify(targetDir, targetName, manifestPath) {
  const manifestResult = loadManifest(manifestPath);
  if ('error' in manifestResult) return { error: manifestResult, manifest: null };
  const { manifest } = manifestResult;
  const targetErr = checkTargetDir(targetDir);
  if (targetErr) return { error: targetErr, manifest: null };
  const hmacResult = verifyManifestHmac(manifest);
  if (!hmacResult.valid) {
    return { error: { ok: false, mismatches: [], missing: [], extra: [], manifest,
      error: `manifest integrity check failed: ${hmacResult.error}` }, manifest: null };
  }
  return { error: null, manifest };
}

/**
 * Verify a target directory against a stored manifest.
 * Rejects symlinks on both manifest path and target directory (CWE-59).
 * Fails closed on missing manifest, malformed manifest, or HMAC mismatch.
 * @param {string} targetDir absolute path to deployed directory
 * @param {string} targetName logical name (e.g. 'copilot')
 * @param {{ manifestDir?: string }} opts optional overrides
 * @returns {VerifyResult} verification result
 */
function verifyDeploy(targetDir, targetName, opts = {}) {
  if (!targetDir || typeof targetDir !== 'string' || !targetName || typeof targetName !== 'string') {
    return { ok: false, mismatches: [], missing: [], extra: [], manifest: null,
      error: 'verifyDeploy: invalid arguments — targetDir and targetName must be non-empty strings' };
  }
  const manifestPath = path.join(opts.manifestDir || MANIFEST_DIR, `${targetName}.manifest.json`);
  const { error, manifest } = prepareVerify(targetDir, targetName, manifestPath);
  if (error) return error;
  const expectedMap = new Map(manifest.entries.map((e) => [e.path, e.sha256]));
  const actualFiles = collectFiles(targetDir);
  const actualMap = new Map(
    actualFiles
      .map((f) => [path.relative(targetDir, f), f])
      .filter(([relPath]) => isDeployedPath(targetName, relPath))
  );
  const { mismatches, missing, extra } = diffEntries(expectedMap, actualMap);
  return { ok: mismatches.length === 0 && missing.length === 0, mismatches, missing, extra, manifest };
}

if (require.main === module) {
  const [, , targetArg] = process.argv;
  const validTargets = Object.keys(TARGET_DIRS);
  if (!targetArg || !validTargets.includes(targetArg)) {
    console.error(`Usage: verify-deploy.js <${validTargets.join('|')}>`);
    process.exit(1);
  }
  const result = verifyDeploy(TARGET_DIRS[targetArg], targetArg);
  if (result.error) { console.error(`verify-deploy [${targetArg}]: ${result.error}`); process.exit(1); }
  if (result.ok) {
    console.log(`verify-deploy [${targetArg}]: OK — ${result.manifest.file_count} file(s) match manifest`);
    if (result.extra.length) console.log(`  info: ${result.extra.length} extra file(s) not in manifest`);
    process.exit(0);
  }
  console.error(`verify-deploy [${targetArg}]: INTEGRITY FAILURE`);
  for (const p of result.mismatches) console.error(`  HASH MISMATCH: ${p}`);
  for (const p of result.missing) console.error(`  MISSING:       ${p}`);
  process.exit(1);
}

module.exports = { verifyDeploy };
