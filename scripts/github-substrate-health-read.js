// tier: 2
// github-substrate-health-read.js — reads latest substrate health from GH Actions artifact. Refs #2754.
'use strict';
const { execSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

function readSubstrateHealth(repo) {
  try {
    const runs = execSync(
      `gh run list --repo "${repo}" --workflow "substrate-health.yml" --limit 1 --json databaseId`,
      { encoding: 'utf8' }
    );
    const runId = JSON.parse(runs)[0]?.databaseId;
    if (!runId) return null;
    const dir = os.tmpdir();
    execSync(`gh run download ${runId} --repo "${repo}" --name "health.json" --dir "${dir}"`, { encoding: 'utf8' });
    return JSON.parse(fs.readFileSync(path.join(dir, 'health.json'), 'utf8'));
  } catch { return null; }
}

module.exports = { readSubstrateHealth };
