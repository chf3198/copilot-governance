#!/usr/bin/env node
'use strict';
const { classifyPrompt } = require('./task-router');

const cases = [
  { prompt: 'search and explain docs layout', want: 'free' },
  { prompt: 'implement medium multi-file refactor with tests', want: 'fleet' },
  {
    prompt: 'design complex architecture with security and performance trade-offs',
    want: 'premium'
  }
];

let failed = 0;
for (const test of cases) {
  const got = classifyPrompt(test.prompt).lane;
  const ok = got === test.want;
  console.log(`${ok ? 'OK' : 'FAIL'} ${test.want} <= "${test.prompt}" => ${got}`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  console.error(`Smoke failed: ${failed} case(s).`);
  process.exit(1);
}
console.log('Router smoke passed.');
process.exit(0);
