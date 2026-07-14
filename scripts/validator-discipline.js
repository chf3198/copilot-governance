'use strict';

// validator-discipline — ADVISORY gate (Tier-2 anneal #1893). A new/modified *validator* under
// `scripts/` MUST ship with (a) a sibling `scripts/<name>.spec.js` in the same changeset AND
// (b) an entry in `inventory/harness-self-test-registry.json`. Otherwise the validator can "exist"
// while never running — dead weight at best, a silent regression-inducer at worst (pattern instance
// 2026-05-18: untracked `research-first-phase-gate.js` shipped with no spec + no self-test wiring).
//
// Advisory-first by construction (matches epic-child-baton-traceability / accountable-team-verify /
// harness norm): the CLI ALWAYS exits 0 and never blocks. Promote to a hard gate only after a shadow
// period with a low false-positive rate (AC5).
//
// Invariants (all emit `advisory`):
//   VD1  an added/modified validator lacks a sibling spec in the changeset
//   VD2  an added/modified validator has no entry in the self-test registry

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

// Modules under scripts/ that are libraries/schemas/builders, NOT validators — exempt from the
// spec + registry requirement. Keep this tight: over-broad allowlisting defeats the gate.
const SUPPORT_ALLOWLIST = new Set([
  'baton-artifact-schema.js',
  'baton-artifact-builder.js',
  'baton-comment-build.js',
  'signer-alias.js',
  'event-schema-v3.js',
  'event-schema-otel-genai.js',
  'log-redaction.js',
  'friction-event.js',
]);

const isSpec = (f) => /\.spec\.js$/.test(f);
// Flat layout: a validator is `scripts/<name>.js` (one path segment under scripts/).
const isScriptsJs = (f) => /^scripts\/[^/]+\.js$/.test(String(f));
const specFor = (f) => String(f).replace(/\.js$/, '.spec.js');
const nameKey = (f) => path.basename(String(f)).replace(/\.js$/, '');

// Pure. `changedFiles` = repo-relative paths added/modified in the PR diff.
// `registry` = parsed harness-self-test-registry.json ({ validators: [{ name, spec }] }).
// Returns { violations: [{ code, file, message }] }.
function auditChangedFiles(changedFiles, registry) {
  const files = Array.isArray(changedFiles) ? changedFiles.map(String) : [];
  const set = new Set(files);
  const regNames = new Set(
    (registry && Array.isArray(registry.validators) ? registry.validators : [])
      .map((v) => (v && v.name ? String(v.name) : ''))
      .filter(Boolean),
  );
  const violations = [];
  for (const f of files) {
    if (!isScriptsJs(f) || isSpec(f)) continue;
    if (SUPPORT_ALLOWLIST.has(path.basename(f))) continue;
    const key = nameKey(f);
    if (!set.has(specFor(f))) {
      violations.push({
        code: 'VD1_missing_spec',
        file: f,
        message: `validator ${f} added/modified without sibling ${specFor(f)} in the changeset`,
      });
    }
    if (!regNames.has(key)) {
      violations.push({
        code: 'VD2_missing_registry_entry',
        file: f,
        message: `validator ${f} has no entry (name: "${key}") in inventory/harness-self-test-registry.json`,
      });
    }
  }
  return { violations };
}

function loadRegistry(root) {
  const p = path.join(root, 'inventory', 'harness-self-test-registry.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { validators: [] };
  }
}

// Best-effort changed-file discovery from git. Returns null if unavailable (e.g. a .git-less
// archive) so the CLI degrades to a clean advisory no-op rather than throwing — keeps it hermetic.
function changedFilesFromGit(root, base) {
  try {
    const out = cp.execSync(`git diff --name-only ${base}...HEAD`, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const root = process.cwd();
  const filesArg = args.find((a) => a.startsWith('--files='));
  let files;
  if (filesArg) {
    files = filesArg.slice('--files='.length).split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    const baseArg = args.find((a) => a.startsWith('--base='));
    const base = baseArg ? baseArg.slice('--base='.length) : 'origin/main';
    files = changedFilesFromGit(root, base) || [];
  }
  const { violations } = auditChangedFiles(files, loadRegistry(root));
  if (violations.length) {
    console.log(`validator-discipline: ${violations.length} advisory violation(s):`);
    for (const v of violations) console.log(`  [${v.code}] ${v.message}`);
  } else {
    console.log('validator-discipline: OK — no unguarded validators in changeset.');
  }
  process.exit(0); // advisory-first: never fail the run
}

if (require.main === module) main();

module.exports = { auditChangedFiles, loadRegistry, SUPPORT_ALLOWLIST };
