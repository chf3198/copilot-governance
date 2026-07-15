#!/usr/bin/env node
'use strict';
// tier: 3
const os = require('os');

const args = Object.fromEntries(process.argv.slice(2)
  .map(a => a.split('='))
  .map(([k, v]) => [k.replace(/^--/, ''), v ?? 'true']));
const model = args.model || 'tinyllama:latest';
const host = args.host || 'http://127.0.0.1:11434';
const prompt = args.prompt || 'terminal-uat-ping';
const keepAlive = args.keepAlive || '30m';
const intervalMs = Math.max(300, (Number(args.interval) || 1.5) * 1000);
const durationMs = Math.max(5000, (Number(args.duration) || 60) * 1000);
const nodeLabel = args.node || os.hostname();

process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); });
const ts = () => new Date().toTimeString().slice(0, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function generateOnce() {
  const started = Date.now();
  const body = { model, prompt, stream: false, keep_alive: keepAlive };
  const res = await fetch(`${host.replace(/\/$/, '')}/api/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`http${res.status}`);
  await res.json();
  return Date.now() - started;
}

async function run() {
  const endAt = Date.now() + durationMs;
  let ok = 0; let fail = 0; let totalMs = 0;
  console.log(`# Stress start node=${nodeLabel} model=${model} duration=${durationMs / 1000}s interval=${intervalMs / 1000}s`);
  while (Date.now() < endAt) {
    try {
      const ms = await generateOnce();
      ok += 1; totalMs += ms;
      const avg = (totalMs / ok).toFixed(0);
      console.log(`[${ts()}] node=${nodeLabel} stress=ok req=${ok} fail=${fail} last_ms=${ms} avg_ms=${avg}`);
    } catch (e) {
      fail += 1;
      console.log(`[${ts()}] node=${nodeLabel} stress=fail req=${ok} fail=${fail} err=${e.message}`);
    }
    await sleep(intervalMs);
  }
  const avg = ok ? (totalMs / ok).toFixed(0) : '-';
  console.log(`# Stress done node=${nodeLabel} ok=${ok} fail=${fail} avg_ms=${avg}`);
  process.exit(fail > 0 ? 2 : 0);
}

void run();
