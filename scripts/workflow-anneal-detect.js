#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { run } = require('./anneal-tier2-autofile');
const { readEvents } = require('./anneal-event-schema');

const INCIDENTS = path.join(os.homedir(), '.megingjord', 'incidents.jsonl');

function parseArgs(argv) {
  const args = new Set(argv);
  const fixtureIndex = argv.indexOf('--fixture');
  return {
    apply: args.has('--apply'),
    dryRun: args.has('--dry-run'),
    fixture: fixtureIndex >= 0 ? argv[fixtureIndex + 1] : '',
    out: argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : '',
  };
}

function writeSnapshot(events, outPath) {
  if (!outPath) return;
  fs.writeFileSync(outPath, JSON.stringify({ events }, null, 2));
}

function main(argv) {
  const args = parseArgs(argv);
  const events = args.fixture
    ? JSON.parse(fs.readFileSync(args.fixture, 'utf8')).events
    : readEvents(INCIDENTS).filter((e) => Number(e.tier || '0') === 1);
  writeSnapshot(events, args.out);
  const forwarded = [];
  if (args.apply && !args.dryRun) forwarded.push('--apply');
  if (args.fixture) forwarded.push('--fixture', args.fixture);
  if (!args.fixture && args.out) forwarded.push('--fixture', args.out);
  run(forwarded);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { parseArgs, main, INCIDENTS };
