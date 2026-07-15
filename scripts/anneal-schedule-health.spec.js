#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { actorHealth } = require('./anneal-schedule-health');

function testSkipForManual() {
  const out = actorHealth('nova', 'workflow_dispatch');
  assert.strictEqual(out.status, 'skip');
}

function testWarnWithoutActor() {
  const out = actorHealth('', 'schedule');
  assert.strictEqual(out.status, 'warn');
}

testSkipForManual();
testWarnWithoutActor();
process.stdout.write('anneal-schedule-health.spec: PASS\n');
