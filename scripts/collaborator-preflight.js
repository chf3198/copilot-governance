'use strict';
// tier: 3
// collaborator-preflight — quality gates before COLLABORATOR_HANDOFF. Refs #2438.
// Gates: lint → tests → changelog-fragment → fleet cross-family review.
// Refs #3166: --test-paths scopes the test step to a changed-file subset.

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');

function runLint(cwd = ROOT) {
  const r = spawnSync('npm', ['run', 'lint'], { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, output: r.stderr || r.stdout };
}

/** Derive sibling spec paths for changed source files. */
function deriveTestPaths(changedFiles, cwd = ROOT) {
  return changedFiles
    .map(file => {
      const base = path.basename(file, '.js');
      const candidate = path.join(cwd, 'tests', `${base}.spec.js`);
      return fs.existsSync(candidate) ? candidate : null;
    })
    .filter(Boolean);
}

/** Resolve the test-path subset from CLI args or git diff. */
function resolveTestScope(argv, cwd = ROOT) {
  const explicit = (argv.find(arg => arg.startsWith('--test-paths=')) || '')
    .replace('--test-paths=', '').split(',').filter(Boolean);
  if (explicit.length) return explicit;
  const base = spawnSync('git', ['merge-base', 'HEAD', 'main'], {
    cwd, encoding: 'utf8',
  });
  if (base.status !== 0) return [];
  const diff = spawnSync('git', [
    'diff', '--name-only', '--diff-filter=ACMR',
    base.stdout.trim(), 'HEAD',
  ], { cwd, encoding: 'utf8' });
  if (diff.status !== 0) return [];
  const changed = (diff.stdout || '').split('\n').filter(Boolean);
  return deriveTestPaths(changed, cwd);
}

// #3333 AC2: the scoped runner uses `node --test`, which CANNOT execute
// @playwright/test specs (the canonical baton-artifact spec format) — they were
// reported as a false node:test miss. Partition the changed-spec set by content so
// playwright specs dispatch via `npx playwright test` and are actually executed.
// readFile is injected so the partition is unit-testable without disk.
function partitionSpecs(relPaths, readFile) {
  const playwright = [];
  const node = [];
  for (const rel of relPaths) {
    let src = '';
    try { src = readFile(rel); } catch (_) { src = ''; }
    (/@playwright\/test/.test(src) ? playwright : node).push(rel);
  }
  return { node, playwright };
}

function runTests(cwd = ROOT, testPaths) {
  if (testPaths && testPaths.length) {
    const rel = testPaths.map(tp => path.relative(cwd, path.resolve(tp)));
    const { node: nodeSpecs, playwright: pwSpecs } = partitionSpecs(
      rel, p => fs.readFileSync(path.resolve(cwd, p), 'utf8'));
    let output = '';
    if (nodeSpecs.length) {
      const scoped = spawnSync('node', ['--test', ...nodeSpecs], { cwd, encoding: 'utf8' });
      output += scoped.stderr || scoped.stdout || '';
      if (scoped.status !== 0) return { ok: false, output };
    }
    if (pwSpecs.length) {
      const pw = spawnSync('npx', ['playwright', 'test', ...pwSpecs], { cwd, encoding: 'utf8' });
      output += pw.stderr || pw.stdout || '';
      if (pw.status !== 0) return { ok: false, output };
    }
    return { ok: true, output };
  }
  const full = spawnSync('npm', ['test'], { cwd, encoding: 'utf8' });
  return { ok: full.status === 0, output: full.stderr || full.stdout };
}

function checkChangelogFragment(ticket, cwd = ROOT) {
  const p = path.join(cwd, '.changes', 'unreleased', `${ticket}.md`);
  return { ok: fs.existsSync(p), path: p };
}

// #3167: a reviewer from the authoring (Anthropic) family can never be labelled
// cross-family — that would defeat the whole invariant.
const ANTHROPIC_FAMILY_RE = /claude|anthropic|opus|sonnet|haiku/i;

// #3167: pure interpretation of a dispatchRedTeam result into cross-family fields.
// Exported for direct unit testing of the degraded / non-cross-family paths.
function interpretReview(result) {
  const stats = result.hamrStats || {};
  const reviewerModel = result.modelUsed || 'qwen2.5-coder:7b';
  // AC2: a degraded dispatch (fleet AND free-cloud unreachable) is a VISIBLE non-pass
  // — never a fabricated rating that reads as a pass — and an Anthropic reviewer is
  // rejected rather than mislabelled cross-family.
  const nonCrossFamily = ANTHROPIC_FAMILY_RE.test(reviewerModel);
  if (stats.ok === false || stats.degraded === true || nonCrossFamily) {
    const reason = nonCrossFamily
      ? `rejected-non-cross-family-reviewer:${reviewerModel}`
      : (stats.degraded_reason || 'fleet-unreachable');
    return {
      reviewer: `${reviewerModel}@unavailable`, rating: null, available: false,
      findings: `cross-family review UNAVAILABLE (${reason})`,
    };
  }
  // AC3: read the response TEXT, never .match/.slice on the raw object.
  const text = result.text || '';
  const host = stats.substituted ? 'free-cloud' : '100.91.113.16:11434';
  const rating = parseInt(text.match(/rating[:\s]+(\d+)/i)?.[1] || '70', 10);
  return {
    reviewer: `${reviewerModel}@${host}`, rating, available: true,
    findings: (result.findings || []).map(finding => finding.detail || finding.raw || finding)
      .join('; ') || text.slice(0, 200) || 'none',
  };
}

async function runFleetReview(content, ticket) {
  const { dispatchRedTeam } = require('./fleet-red-team-dispatch.js');
  const result = await dispatchRedTeam({
    artifactType: 'collaborator-handoff', content,
    taskContext: { ticket },
  });
  return interpretReview(result);
}

async function run(argv = process.argv.slice(2), opts = {}) {
  const ticket = (argv.find(a => a.startsWith('--ticket=')) || '')
    .replace('--ticket=', '');
  if (!ticket) { console.error('[preflight] --ticket=N required'); return false; }

  const lint = opts.runLint ? opts.runLint() : runLint();
  if (!lint.ok) { console.error('[preflight] lint failed'); return false; }

  const testPaths = opts.testPaths || resolveTestScope(argv);
  const tests = opts.runTests
    ? opts.runTests(ROOT, testPaths)
    : runTests(ROOT, testPaths);
  if (!tests.ok) { console.error('[preflight] tests failed'); return false; }

  const changelog = opts.checkChangelog
    ? opts.checkChangelog(ticket) : checkChangelogFragment(ticket);
  if (!changelog.ok) {
    console.error(`[preflight] missing changelog fragment: ${changelog.path}`);
    return false;
  }

  const diffFiles = (argv.find(a => a.startsWith('--diff-files=')) || '')
    .replace('--diff-files=', '').split(',').filter(Boolean);
  const content = diffFiles.map(f => {
    try { return fs.readFileSync(path.resolve(f), 'utf8'); } catch (_) { return ''; }
  }).join('\n');
  const review = opts.runFleetReview
    ? await opts.runFleetReview(content, ticket)
    : await runFleetReview(content, ticket);

  const receipt = crypto.createHash('sha256')
    .update(`${review.reviewer}|${review.rating}|${review.findings}|${ticket}`)
    .digest('hex').slice(0, 16);
  // #3167 AC2: surface an unreachable review as a VISIBLE non-pass, not a number.
  const ratingLine = review.available === false
    ? 'UNAVAILABLE (fleet + free-cloud unreachable — visible non-pass)'
    : `${review.rating}/100`;
  console.log('\n=== COLLABORATOR_HANDOFF cross-family fields ===');
  console.log(`cross_family_reviewer: ${review.reviewer}`);
  console.log(`cross_family_rating: ${ratingLine}`);
  console.log(`cross_family_findings: ${review.findings}`);
  console.log(`cross_family_receipt: ${receipt}`);
  return true;
}

if (require.main === module) {
  if (process.argv.includes('--help')) {
    console.log('Usage: node collaborator-preflight.js --ticket=N [--diff-files=a,b,...]');
    process.exit(0);
  }
  run().then(ok => process.exit(ok ? 0 : 1));
}

module.exports = {
  run, runLint, runTests, checkChangelogFragment,
  deriveTestPaths, resolveTestScope, interpretReview, runFleetReview,
  partitionSpecs,
};
