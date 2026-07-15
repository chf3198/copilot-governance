#!/usr/bin/env node
// broker-synthesis-status — thin read-only wrapper exposing
// `synthesis status --epic <N>` for live synthesis state.
// Refs Epic #1112 AC7 (#2406). Companion to broker.js (#1088).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MS_PER_HOUR = 3600 * 1000;
const TERMINAL_CAP_HOURS = 24;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    if (argv[i]?.startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readTextIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function status(rdN, opts = {}) {
  if (!rdN || !Number.isInteger(rdN)) {
    throw new Error('--epic <N> is required and must be an integer');
  }
  const root = opts.root || process.cwd();
  const synthDir = path.join(root, 'planning', `synthesis-${rdN}`);
  if (!fs.existsSync(synthDir)) {
    throw new Error(`synthesis-${rdN} does not exist at ${synthDir}`);
  }
  const pulse = readJsonIfExists(path.join(synthDir, 'pulse.json'));
  const stability = readJsonIfExists(path.join(synthDir, 'stability.json'));
  const statusText = readTextIfExists(path.join(synthDir, 'status.md')) || '';
  const phaseMatch = statusText.match(/Phase:\s*([^\n]+)/);
  const waveMatch = statusText.match(/Wave:\s*(\d+)/);
  const now = opts.now ? new Date(opts.now) : new Date();
  const kickoff = pulse?.kickoff ? new Date(pulse.kickoff) : null;
  const elapsedHours = kickoff ? (now - kickoff) / MS_PER_HOUR : null;
  const capHours = opts.capHours || TERMINAL_CAP_HOURS;
  const remainingHours = elapsedHours !== null ? Math.max(0, capHours - elapsedHours) : null;
  const wavePValues = stability?.wave_p_values || [];
  const latestPValue = wavePValues.length > 0 ? wavePValues[wavePValues.length - 1] : null;
  return {
    rdN, admin: pulse?.admin || null, kickoff: pulse?.kickoff || null,
    phase: phaseMatch?.[1].trim() || null, wave: waveMatch ? Number(waveMatch[1]) : null,
    elapsedHours: elapsedHours !== null ? Math.round(elapsedHours * 100) / 100 : null,
    remainingHours: remainingHours !== null ? Math.round(remainingHours * 100) / 100 : null,
    capHours, latestKsPvalue: latestPValue, totalWavesObserved: wavePValues.length,
    ksThreshold: stability?.threshold || null, consecutiveRequired: stability?.consecutive_required || null,
  };
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  try {
    const result = status(Number(args.epic), { capHours: args['cap-hours'] ? Number(args['cap-hours']) : undefined });
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { status };
