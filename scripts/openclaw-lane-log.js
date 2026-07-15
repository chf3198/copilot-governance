#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const [cmd = 'report', lane = 'openclaw', task = 'coding'] = process.argv.slice(2);
const dir = path.join(os.homedir(), '.copilot');
const file = path.join(dir, 'openclaw-usage.log');

function readRows() {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

if (cmd === 'record') {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), lane, task }) + '\n');
  console.log(`recorded lane=${lane} task=${task}`);
  process.exit(0);
}

const days = Number(process.argv[3] || 7);
const cut = Date.now() - days * 86400000;
const rows = readRows().filter(r => Date.parse(r.ts) >= cut);
const total = rows.length;
const openclaw = rows.filter(r => r.lane === 'openclaw').length;
const local = rows.filter(r => r.lane === 'local').length;
const pct = total ? Math.round((openclaw / total) * 100) : 0;
console.log(`window_days=${days} total=${total} openclaw=${openclaw} local=${local} openclaw_pct=${pct}`);
if (total && pct < 60) {
  console.log('status=below-target target=60 action=route-next-heavy-slice-to-openclaw');
  process.exitCode = 1;
}
