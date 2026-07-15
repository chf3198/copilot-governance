#!/usr/bin/env node
'use strict';
// tier: 1
// hydration-lint (#2771, Epic #2291): prevention-over-reaction gate for the env-hydration contract.
// Fails on (R1) `require('dotenv')`/`import dotenv` outside the canonical shim; (R2) a JS file that
// reads a credential `process.env.<CRED>` without referencing the hydration shim; (R3) a value-leak —
// a console/logger/print call whose argument is a credential env read. Credential names = the default
// suffix set plus a project-configurable list (config/credential-name-patterns.json). Pure logic +
// CLI; the CLI scans `scripts/` so it runs in pre-push + CI (npm run hooks:pre-push) — capability-
// independent enforcement (cf. #2356). Documented non-standalone fragments are exempt (G2, no FP).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SHIM_REL = 'scripts/global/load-local-env.js';
// Non-standalone / definitional exemptions (the shim defines hydration; the availability + lint
// modules reference credential names structurally; dashboard-api-handlers is a concatenated fragment
// hydrated transitively by dashboard-server.js).
const EXEMPT = new Set([
  SHIM_REL,
  'scripts/global/credential-availability.js',
  'scripts/global/hydration-lint.js',
  'scripts/dashboard-api-handlers.js',
]);

/**
 * Build the credential-name regex source from the patterns config (default + project extra).
 * @param {{default?:string[],extra?:string[]}} cfg @returns {string} a regex alternation fragment
 */
function credentialAlternation(cfg) {
  const parts = [...(cfg.default || []), ...(cfg.extra || [])].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return parts.length ? `(?:${parts.join('|')})` : '(?:_API_KEY|_TOKEN|_SECRET|_KEY|PASSWORD)';
}

/**
 * Scan one file's text for hydration-contract violations. Pure — no IO.
 * @param {string} relPath @param {string} text @param {string} credAlt credential-name alternation
 * @returns {Array<{rule:string,file:string,detail:string}>}
 */
function scanText(relPath, text, credAlt) {
  const violations = [];
  if (EXEMPT.has(relPath)) return violations;
  const credRead = new RegExp(`process\\.env(?:\\.[A-Za-z_]*${credAlt}[A-Za-z_]*|\\[['"][A-Za-z_]*${credAlt}[A-Za-z_]*['"]\\])`);
  // R1 — dotenv outside the shim
  if (/require\(['"]dotenv['"]\)|^\s*import\s+.*\bdotenv\b/m.test(text)) {
    violations.push({ rule: 'dotenv-outside-shim', file: relPath, detail: 'use loadLocalEnvOnce() from load-local-env.js, not dotenv directly' });
  }
  // R2 — credential read without hydration reference
  if (credRead.test(text) && !/load-local-env|loadLocalEnv/.test(text)) {
    violations.push({ rule: 'unhydrated-consumer', file: relPath, detail: 'reads a credential process.env.* but never calls loadLocalEnvOnce() — hydrate before reading' });
  }
  // R3 — value-leak: a log/print sink whose argument embeds a credential env read
  const leak = new RegExp(`(?:console\\.[a-z]+|logger\\.[a-z]+|print)\\s*\\([^)]*${credRead.source}`);
  if (leak.test(text)) {
    violations.push({ rule: 'credential-value-leak', file: relPath, detail: 'a log/print sink embeds a credential env value — log names only (G4)' });
  }
  return violations;
}

/** Recursively collect `.js` files under a dir, skipping node_modules. @returns {string[]} abs paths */
function jsFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const entryPath = path.join(dir, e.name);
    if (e.isDirectory()) jsFiles(entryPath, out);
    else if (e.name.endsWith('.js') && !e.name.endsWith('.spec.js')) out.push(entryPath);
  }
  return out;
}

/** Lint the repo's `scripts/` tree. @returns {Array<{rule,file,detail}>} */
function lintRepo(root = ROOT) {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(root, 'config/credential-name-patterns.json'), 'utf8')); }
  catch { cfg = {}; }
  const credAlt = credentialAlternation(cfg);
  const out = [];
  for (const abs of jsFiles(path.join(root, 'scripts'))) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    out.push(...scanText(rel, fs.readFileSync(abs, 'utf8'), credAlt));
  }
  return out;
}

/**
 * One-time collision-risk audit (#2771 AC8): list non-credential `process.env.X` reads whose name
 * would become a credential match if a `*_KEY`/`*_TOKEN`/... sibling were later added. Advisory only —
 * never gates. @returns {Array<{file:string,name:string}>}
 */
function auditCollisionRisk(root = ROOT) {
  const out = [];
  const readRe = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;
  const credSuffix = /(_API_KEY|_TOKEN|_SECRET|_KEY|PASSWORD)$/;
  for (const abs of jsFiles(path.join(root, 'scripts'))) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    const text = fs.readFileSync(abs, 'utf8');
    let m;
    while ((m = readRe.exec(text))) {
      const name = m[1];
      if (!credSuffix.test(name) && /(API|TOKEN|SECRET|AUTH|PASS|CRED)/i.test(name)) out.push({ file: rel, name });
    }
  }
  return out;
}

module.exports = { scanText, credentialAlternation, lintRepo, auditCollisionRisk, EXEMPT };

if (require.main === module) {
  if (process.argv.includes('--audit')) {
    const risks = auditCollisionRisk();
    console.log(`hydration-lint audit: ${risks.length} collision-risk env name(s) (advisory, non-gating)`);
    risks.forEach((r) => console.log(`  - ${r.file}: process.env.${r.name}`));
    process.exit(0);
  }
  const findings = lintRepo();
  if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify(findings) + '\n'); }
  if (findings.length) {
    console.error(`hydration-lint: ${findings.length} violation(s):`);
    findings.forEach((f) => console.error(`  - [${f.rule}] ${f.file}: ${f.detail}`));
    process.exit(1);
  }
  console.log('hydration-lint: OK — all credential consumers hydrate; no dotenv-outside-shim; no value leaks');
}
