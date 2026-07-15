#!/usr/bin/env node
'use strict';
// tier: 3
const os = require('os');
const { execSync } = require('child_process');

const args = Object.fromEntries(process.argv.slice(2)
  .map((a) => a.split('='))
  .map(([k, v]) => [k.replace(/^--/, ''), v ?? 'true']));
const intervalMs = Math.max(2000, (Number(args.interval) || 3) * 1000);
const nodeLabel = args.node || os.hostname();
const openclawUrl = args.openclawUrl || '';
const mode = args.mode || 'line';

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
});

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

function memFreeGb() {
  return `${(os.freemem() / (1024 ** 3)).toFixed(2)}GB`;
}

function ollamaStatus() {
  try {
    const out = execSync('ollama ps', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = out.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return { up: true, state: 'idle', model: '-', until: '-' };
    const row = lines[1].trim().split(/\s{2,}/);
    const model = row[0] || '-';
    const until = row[row.length - 1] || '-';
    return { up: true, state: 'active', model, until };
  } catch (error) {
    return { up: false, state: 'down', model: '-', until: '-' };
  }
}

async function openclawStatus() {
  if (!openclawUrl) return '-';
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1200);
    const res = await fetch(`${openclawUrl.replace(/\/$/, '')}/health/liveliness`, {
      signal: c.signal
    });
    clearTimeout(t);
    return res.ok ? 'live' : `http${res.status}`;
  } catch (error) {
    return 'down';
  }
}

async function tick() {
  const o = ollamaStatus();
  const oc = await openclawStatus();
  const parts = [
    `[${ts()}]`,
    `node=${nodeLabel}`,
    `openclaw=${oc}`,
    `ollama=${o.up ? 'up' : 'down'}`,
    `state=${o.state}`,
    `model=${o.model}`,
    `until=${o.until}`,
    `ram_free=${memFreeGb()}`
  ];
  const line = parts.join(' ');
  if (mode === 'single') {
    const pad = Math.max(0, 190 - line.length);
    process.stdout.write(`\r${line}${' '.repeat(pad)}`);
    return;
  }
  console.log(line);
}

console.log(`# Fleet live indicator started interval=${intervalMs / 1000}s node=${nodeLabel}`);
if (openclawUrl) console.log(`# OpenClaw monitor URL: ${openclawUrl}`);
if (mode === 'single') console.log('# Render mode: single-line');
void tick();
setInterval(() => void tick(), intervalMs);
