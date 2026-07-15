#!/usr/bin/env node
// synthesis-snapshot — admin snapshot job per protocol v3 §5 termination.
// Reads planning/synthesis-<rdN>/, computes K-S adaptive stability,
// updates stability.json, returns WAVE_SUMMARY block + TERMINATE marker if stable
// OR 24h ceiling elapsed. Refs Epic #1112 AC4 (#2405).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ks2Sample } = require('./ks-test.js');

const MS_PER_HOUR = 3600 * 1000;
const DEFAULT_CEILING_HOURS = 24;
const KS_THRESHOLD = 0.05;
const CONSECUTIVE_REQUIRED = 3;

function decisionStateToNumber(state) {
  if (state === 'concur') return 1;
  if (state === 'concur-with-constraint') return 2;
  if (state === 'reject') return 3;
  return 0;
}

function readWaveDistribution(synthDir, wave) {
  const decisionsPath = path.join(synthDir, 'decisions.md');
  if (!fs.existsSync(decisionsPath)) return [];
  const text = fs.readFileSync(decisionsPath, 'utf8');
  const wavePattern = new RegExp(`<!-- wave-${wave} -->([\\s\\S]*?)(?=<!-- wave-${wave + 1} -->|$)`);
  const m = text.match(wavePattern);
  if (!m) return [];
  const stateMatches = [...m[1].matchAll(/state:\s*(\w[\w-]*)/g)];
  return stateMatches.map(sm => decisionStateToNumber(sm[1]));
}

function shouldTerminate(stability, ceilingReached) {
  const pValues = stability.wave_p_values || [];
  const consecutive = pValues.slice(-CONSECUTIVE_REQUIRED);
  const stable = consecutive.length >= CONSECUTIVE_REQUIRED && consecutive.every(p => p < KS_THRESHOLD);
  return stable || ceilingReached;
}

function loadOrInitStability(stabilityPath) {
  if (fs.existsSync(stabilityPath)) return JSON.parse(fs.readFileSync(stabilityPath, 'utf8'));
  return { wave_p_values: [], threshold: KS_THRESHOLD, consecutive_required: CONSECUTIVE_REQUIRED };
}

function computeWaveKs(synthDir, currentWave) {
  const prev = readWaveDistribution(synthDir, currentWave - 1);
  const curr = readWaveDistribution(synthDir, currentWave);
  if (prev.length === 0 || curr.length === 0) return { p_value: 1, ks_statistic: 0, computed: false };
  return { ...ks2Sample(prev, curr), computed: true };
}

function snapshot(rdN, opts = {}) {
  if (!rdN || !Number.isInteger(rdN)) throw new Error('--epic <N> required (integer)');
  const root = opts.root || process.cwd();
  const synthDir = path.join(root, 'planning', `synthesis-${rdN}`);
  if (!fs.existsSync(synthDir)) throw new Error(`synthesis-${rdN} does not exist`);
  const stabilityPath = path.join(synthDir, 'stability.json');
  const stability = loadOrInitStability(stabilityPath);
  const pulse = JSON.parse(fs.readFileSync(path.join(synthDir, 'pulse.json'), 'utf8'));
  const currentWave = (stability.wave_p_values?.length || 0) + 1;
  const result = computeWaveKs(synthDir, currentWave);
  if (result.computed) stability.wave_p_values.push(result.p_value);
  fs.writeFileSync(stabilityPath, JSON.stringify(stability, null, 2) + '\n');
  const now = opts.now ? new Date(opts.now) : new Date();
  const elapsedHours = (now - new Date(pulse.kickoff)) / MS_PER_HOUR;
  const ceilingHours = opts.ceilingHours || DEFAULT_CEILING_HOURS;
  const ceilingReached = elapsedHours >= ceilingHours;
  const terminate = shouldTerminate(stability, ceilingReached);
  return {
    rdN, currentWave, ks: result, terminate, ceilingReached,
    elapsedHours: Math.round(elapsedHours * 100) / 100, ceilingHours,
    consecutivePValues: stability.wave_p_values.slice(-CONSECUTIVE_REQUIRED),
  };
}

if (require.main === module) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    if (process.argv[i]?.startsWith('--')) args[process.argv[i].slice(2)] = process.argv[i + 1];
  }
  try {
    const result = snapshot(Number(args.epic),
      { ceilingHours: args['ceiling-hours'] ? Number(args['ceiling-hours']) : undefined });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.terminate ? 2 : 0);
  } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { snapshot, shouldTerminate };
