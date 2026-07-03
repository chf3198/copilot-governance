#!/usr/bin/env node
// tier: 4
// scripts/global/routing-refresh.js — fleet + cloud model probe, matrix updater (#833)
// Usage:
//   node scripts/global/routing-refresh.js                # probe + write snapshot
//   node scripts/global/routing-refresh.js --update-matrix  # also stamp matrix header
'use strict';
const fs = require('fs');
const path = require('path');
require('./load-local-env').loadLocalEnvOnce();

const ROOT = path.resolve(__dirname, '..', '..');
const SNAP = path.join(ROOT, '.dashboard', 'routing-snapshot.json');
const MATRIX = path.join(ROOT, 'research', 'model-compare', 'design-analysis', 'LLM-EVALUATION-MATRIX.md');
const PROBE_TIMEOUT_MS = 8000;

async function timed(p) {
  return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), PROBE_TIMEOUT_MS))]);
}

async function probeOpenAICompat(label, url, key) {
  if (!key) return { provider: label, available: false, reason: 'no-key' };
  try {
    const resp = await timed(fetch(url, { headers: { Authorization: `Bearer ${key}` } }));
    if (!resp.ok) return { provider: label, available: false, reason: `http-${resp.status}` };
    const data = await resp.json();
    const ids = (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean);
    return { provider: label, available: true, models: ids };
  } catch (e) { return { provider: label, available: false, reason: e.message?.slice(0, 40) || 'fetch-err' }; }
}

async function probeOllama(label, url) {
  try {
    const resp = await timed(fetch(url));
    if (!resp.ok) return { provider: label, available: false, reason: `http-${resp.status}` };
    const data = await resp.json();
    return { provider: label, available: true, models: (data.models || []).map(m => m.name) };
  } catch (e) { return { provider: label, available: false, reason: e.message?.slice(0, 40) || 'fetch-err' }; }
}

async function probeGoogle(key) {
  if (!key) return { provider: 'google', available: false, reason: 'no-key' };
  try {
    const resp = await timed(fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`));
    if (!resp.ok) return { provider: 'google', available: false, reason: `http-${resp.status}` };
    const data = await resp.json();
    return { provider: 'google', available: true, models: (data.models || []).map(m => m.name.replace('models/', '')) };
  } catch (e) { return { provider: 'google', available: false, reason: e.message?.slice(0, 40) || 'fetch-err' }; }
}

async function snapshot() {
  const probes = await Promise.all([
    probeOpenAICompat('groq', 'https://api.groq.com/openai/v1/models', process.env.GROQ_API_KEY),
    probeOpenAICompat('cerebras', 'https://api.cerebras.ai/v1/models', process.env.CEREBRAS_API_KEY),
    probeOpenAICompat('openrouter', 'https://openrouter.ai/api/v1/models', process.env.OPENROUTER_API_KEY),
    probeGoogle(process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY),
    probeOllama('36gbwinresource', 'http://100.91.113.16:11434/api/tags'),
    probeOllama('windows-laptop', 'http://100.78.22.13:11434/api/tags'),
    probeOllama('penguin-1', 'http://100.86.248.35:11434/api/tags'),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    providers: Object.fromEntries(probes.map(p => [p.provider, p])),
  };
}

function stampMatrixHeader(snap) {
  if (!fs.existsSync(MATRIX)) return false;
  const today = snap.generatedAt.slice(0, 10);
  let txt = fs.readFileSync(MATRIX, 'utf-8');
  txt = txt.replace(/> ⚠️ \*\*STALE[\s\S]*?Use the routing tier definitions[^\n]*\n/, '');
  txt = txt.replace(/^\*\*Date:\*\*[^\n]*/m, `**Date:** ${today}\n**Last refreshed:** ${today}\n**Snapshot:** \`.dashboard/routing-snapshot.json\``);
  fs.writeFileSync(MATRIX, txt);
  return true;
}

async function main() {
  const snap = await snapshot();
  fs.mkdirSync(path.dirname(SNAP), { recursive: true });
  fs.writeFileSync(SNAP, JSON.stringify(snap, null, 2));
  if (process.argv.includes('--update-matrix')) {
    if (stampMatrixHeader(snap)) process.stdout.write(`✅ matrix header stamped ${snap.generatedAt.slice(0, 10)}\n`);
    else process.stderr.write('❌ matrix file missing — header not stamped\n');
  }
  const counts = Object.entries(snap.providers).map(([k, v]) => `${k}=${v.available ? (v.models?.length || 0) : 'X'}`).join(' ');
  process.stdout.write(`✅ snapshot ${SNAP} (${counts})\n`);
}

if (require.main === module) main().catch(e => { process.stderr.write(`❌ ${e.message}\n`); process.exit(1); });
module.exports = { snapshot, stampMatrixHeader };
