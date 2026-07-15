#!/usr/bin/env node
'use strict';
// fixtures-regen-cursor.js — regenerate tests/fixtures/cursor-onboarding-golden.json
// from live buildPlan('cursor') output. #3537
// Usage: node scripts/global/fixtures-regen-cursor.js [--confirm]
// Default: dry-run (prints what would be written). --confirm: overwrite fixture.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildPlan } = require('./harness-add-runtime');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'cursor-onboarding-golden.json');
const RUNTIME_FILE = path.join(__dirname, 'harness-add-runtime.js');

const confirm = process.argv.includes('--confirm');
const dryRun = !confirm;

const plan = buildPlan('cursor');
const sourceContent = fs.readFileSync(RUNTIME_FILE, 'utf8');
const sourceSha = crypto.createHash('sha256').update(sourceContent).digest('hex').slice(0, 16);

const fixture = {
  runtimeId: 'cursor',
  description: 'Golden snapshot of the cursor scaffold dry-run (T2.4 / #3447). All surfaces must be already-present — zero pending actions is the completeness proof. Regenerate with: npm run fixtures:regen:cursor',
  generated_at: new Date().toISOString(),
  source_sha: sourceSha,
  pendingCount: 0,
  actionCount: plan.length,
  surfaces: plan.map(a => ({ surface: a.surface, op: a.op, detail: a.detail })),
};

if (dryRun) {
  process.stdout.write('[DRY RUN] Would write to: ' + FIXTURE_PATH + '\n');
  process.stdout.write('[DRY RUN] actionCount: ' + fixture.actionCount + '\n');
  process.stdout.write('[DRY RUN] surfaces:\n');
  fixture.surfaces.forEach(s => process.stdout.write('  - ' + s.surface + ' : ' + s.op + '\n'));
  process.stdout.write('[DRY RUN] Pass --confirm to overwrite.\n');
} else {
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2) + '\n');
  process.stdout.write('Wrote fixture: ' + FIXTURE_PATH + '\n');
  process.stdout.write('actionCount: ' + fixture.actionCount + '\n');
  process.stdout.write('source_sha: ' + sourceSha + '\n');
}
