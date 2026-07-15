#!/usr/bin/env node
'use strict';
// deploy-manifest.js (#2914): generate HMAC-signed SHA-256 manifest of deployed runtime artifacts.
// Addresses Gap G-09 (deploy artifact integrity / SLSA gap), OWASP ASI07 + ASI10.
// Trust boundary: HMAC key via DEPLOY_MANIFEST_HMAC_KEY env var.
// When key is set: manifest is signed and signature is verified on load.
// When key is absent: manifest is unsigned — trust boundary documented here.
//   Callers MUST NOT treat an unsigned manifest as authoritative in high-trust contexts.
//   If DEPLOY_MANIFEST_REQUIRE_SIG=1, absence of key is a fatal error (fail-closed).
// Manifests stored in inventory/deploy-manifests/<target>.manifest.json (gitignored state).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before reading DEPLOY_MANIFEST_HMAC_KEY

const MANIFEST_DIR = path.resolve(__dirname, '..', '..', 'inventory', 'deploy-manifests');
const HMAC_ALGO = 'sha256';

/**
 * Derive HMAC key from env.
 * @returns {string|null} key string or null when absent
 */
function getHmacKey() {
  return process.env.DEPLOY_MANIFEST_HMAC_KEY || null;
}

/**
 * Compute HMAC-SHA256 over a manifest body string.
 * @param {string} body canonical JSON string to sign
 * @param {string} key raw key material
 * @returns {string} hex HMAC
 */
function computeHmac(body, key) {
  return crypto.createHmac(HMAC_ALGO, key).update(body, 'utf8').digest('hex');
}

/**
 * Recursively collect all files under a directory, sorted for determinism.
 * Rejects symlinks to prevent CWE-59 path confusion (verified via lstat).
 * @param {string} dir absolute path to scan
 * @returns {string[]} absolute paths, sorted
 */
function collectFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue; // skip symlinks (CWE-59: reject link traversal)
    if (entry.isDirectory()) results.push(...collectFiles(full));
    else if (entry.isFile()) results.push(full);
  }
  return results;
}

/**
 * Hash a file using read-once-into-buffer to avoid TOCTOU (CWE-367).
 * The file content is read atomically into memory before hashing —
 * no stat/re-read window exists between check and use.
 * @param {string} filePath absolute path to the file
 * @returns {string} sha256 hex digest
 */
/**
 * Check if a relative path is part of the deployed files for a target.
 * Filters out IDE-specific or runtime-generated files/directories (CWE-754).
 * @param {string} targetName logical target name
 * @param {string} relPath relative file path
 * @returns {boolean} true if path is deployed
 */
function isDeployedPath(targetName, relPath) {
  if (targetName === 'antigravity') {
    return relPath === 'hooks.json' ||
           relPath === 'instructions.md' ||
           relPath.startsWith('commands/') ||
           relPath.startsWith('agents/');
  }
  if (targetName === 'cursor') {
    return relPath === 'hooks.json' ||
           relPath.startsWith('hooks/') ||
           relPath.startsWith('agents/');
  }
  return true;
}

/**
 * Hash a file using read-once-into-buffer to avoid TOCTOU (CWE-367).
 * The file content is read atomically into memory before hashing —
 * no stat/re-read window exists between check and use.
 * @param {string} filePath absolute path to the file
 * @returns {string} sha256 hex digest
 */
function hashFile(filePath) {
  const content = fs.readFileSync(filePath); // read-once: buffer is hashed immediately
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate a manifest for all files in a target directory.
 * @param {string} targetDir absolute path to deployed directory
 * @param {string} targetName logical name (e.g. 'copilot')
 * @returns {object} manifest object
 */
function generateManifest(targetDir, targetName) {
  if (!fs.existsSync(targetDir)) {
    throw new Error(`deploy-manifest: target directory does not exist: ${targetDir}`);
  }
  const lstat = fs.lstatSync(targetDir);
  if (lstat.isSymbolicLink()) {
    throw new Error(`deploy-manifest: target directory is a symlink — rejected (CWE-59): ${targetDir}`);
  }
  const files = collectFiles(targetDir);
  const entries = files
    .map((filePath) => ({
      path: path.relative(targetDir, filePath),
      sha256: hashFile(filePath),
    }))
    .filter((entry) => isDeployedPath(targetName, entry.path));
  return {
    schema: 'deploy-manifest/v1',
    target: targetName,
    target_dir: targetDir,
    generated_at: new Date().toISOString(),
    file_count: entries.length,
    entries,
  };
}

/**
 * Write manifest JSON to inventory/deploy-manifests/<targetName>.manifest.json.
 * If DEPLOY_MANIFEST_HMAC_KEY is set, appends an hmac_sha256 field over the body.
 * @param {string} targetName logical name (e.g. 'copilot')
 * @param {object} manifest manifest object from generateManifest
 * @returns {string} absolute path of written manifest file
 */
function writeManifest(targetName, manifest) {
  const key = getHmacKey();
  if (!key && process.env.DEPLOY_MANIFEST_REQUIRE_SIG === '1') {
    throw new Error('deploy-manifest: DEPLOY_MANIFEST_REQUIRE_SIG=1 but DEPLOY_MANIFEST_HMAC_KEY is absent — refusing unsigned manifest (fail-closed)');
  }
  const body = JSON.stringify(manifest, null, 2);
  let out;
  if (key) {
    const sig = computeHmac(body, key);
    out = JSON.stringify({ ...manifest, hmac_sha256: sig }, null, 2) + '\n';
  } else {
    // Trust boundary: no key — manifest is unsigned. Consumers MUST NOT rely on integrity
    // without external controls (e.g. filesystem permissions, verified deploy pipeline).
    out = body + '\n';
  }
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  const outPath = path.join(MANIFEST_DIR, `${targetName}.manifest.json`);
  fs.writeFileSync(outPath, out, 'utf8');
  return outPath;
}

/**
 * Verify the HMAC signature of a stored manifest object.
 * Recomputes HMAC over the body WITHOUT the hmac_sha256 field (canonical strip + re-serialize).
 * Returns { valid: true } when key absent (unsigned) unless DEPLOY_MANIFEST_REQUIRE_SIG=1.
 * Returns { valid: false, error: string } on any integrity or configuration failure.
 * @param {object} parsed manifest object parsed from JSON (may contain hmac_sha256 field)
 * @returns {{ valid: boolean, unsigned?: boolean, error?: string }} result
 */
function verifyManifestHmac(parsed) {
  const key = getHmacKey();
  if (!key) {
    if (process.env.DEPLOY_MANIFEST_REQUIRE_SIG === '1') {
      return { valid: false, error: 'DEPLOY_MANIFEST_REQUIRE_SIG=1 but no HMAC key available — fail-closed' };
    }
    return { valid: true, unsigned: true }; // no key configured — trust boundary documented above
  }
  if (!parsed.hmac_sha256) {
    return { valid: false, error: 'manifest has no hmac_sha256 field but key is configured — tamper or format error' };
  }
  // Recompute over the body WITHOUT the hmac_sha256 field (strip it, re-serialize canonically)
  const { hmac_sha256, ...bodyObj } = parsed; // eslint-disable-line no-unused-vars
  const bodyStr = JSON.stringify(bodyObj, null, 2);
  const expected = computeHmac(bodyStr, key);
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parsed.hmac_sha256, 'hex'))) {
    return { valid: false, error: 'manifest HMAC mismatch — manifest may have been tampered' };
  }
  return { valid: true };
}

/**
 * Generate and persist a manifest for the given target directory.
 * @param {string} targetDir absolute path to deployed directory
 * @param {string} targetName logical name (e.g. 'copilot')
 * @returns {{ manifest: object, path: string }} manifest object and written file path
 */
function generateAndWrite(targetDir, targetName) {
  const manifest = generateManifest(targetDir, targetName);
  const outPath = writeManifest(targetName, manifest);
  return { manifest, path: outPath };
}

const TARGET_DIRS = {
  copilot: path.join(process.env.HOME || '/root', '.copilot'),
  codex: path.join(process.env.HOME || '/root', '.codex'),
  claude: path.join(process.env.HOME || '/root', '.claude'),
  antigravity: path.join(process.env.HOME || '/root', '.antigravity'),
  cursor: path.join(process.env.HOME || '/root', '.cursor'),
};

if (require.main === module) {
  const [, , targetArg] = process.argv;
  const validTargets = Object.keys(TARGET_DIRS);
  if (!targetArg || !validTargets.includes(targetArg)) {
    console.error(`Usage: deploy-manifest.js <${validTargets.join('|')}>`);
    process.exit(1);
  }
  const targetDir = TARGET_DIRS[targetArg];
  try {
    const { manifest, path: outPath } = generateAndWrite(targetDir, targetArg);
    const signed = getHmacKey() ? '(signed)' : '(unsigned — set DEPLOY_MANIFEST_HMAC_KEY)';
    console.log(`deploy-manifest: generated ${manifest.file_count} entries → ${outPath} ${signed}`);
  } catch (err) {
    console.error(`deploy-manifest: error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  generateManifest, writeManifest, generateAndWrite, collectFiles, hashFile,
  computeHmac, verifyManifestHmac, getHmacKey, isDeployedPath,
  MANIFEST_DIR, TARGET_DIRS,
};
