// tier: 2
// github-telemetry-read.js — reads latest telemetry artifact from GitHub Actions. Refs #2753.
'use strict';
const { execSync } = require('node:child_process');

function runGh(args) {
  try {
    return execSync(`gh ${args}`, { encoding: 'utf8' });
  } catch { return null; }
}

function getLatestRunId(repo, workflow) {
  const out = runGh(`run list --repo "${repo}" --workflow "${workflow}" --limit 1 --json databaseId`);
  if (!out) return null;
  try { const parsed = JSON.parse(out); return parsed[0]?.databaseId ?? null; } catch { return null; }
}

async function readTelemetry(repo, artifactName = 'telemetry.json') {
  try {
    const runId = getLatestRunId(repo, 'telemetry-collect.yml');
    if (!runId) return null;
    const dir = require('node:os').tmpdir();
    const dl = runGh(`run download ${runId} --repo "${repo}" --name "${artifactName}" --dir "${dir}"`);
    if (dl === null) return null;
    const filePath = require('node:path').join(dir, artifactName);
    return JSON.parse(require('node:fs').readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

async function readSubstrateHealth(repo, artifactName = 'health.json') {
  try {
    const runId = getLatestRunId(repo, 'substrate-health.yml');
    if (!runId) return null;
    const dir = require('node:os').tmpdir();
    runGh(`run download ${runId} --repo "${repo}" --name "${artifactName}" --dir "${dir}"`);
    const filePath = require('node:path').join(dir, artifactName);
    return JSON.parse(require('node:fs').readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

module.exports = { readTelemetry, readSubstrateHealth };
