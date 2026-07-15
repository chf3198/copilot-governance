#!/usr/bin/env node
'use strict';
// tier: 4

require('./load-local-env').loadLocalEnvOnce();

const key = process.env.ANTHROPIC_API_KEY;
const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const model = process.env.ANTHROPIC_SMOKE_MODEL || 'claude-3-5-haiku-latest';

if (!key) {
  console.error(JSON.stringify({ ok: false, error: 'missing_ANTHROPIC_API_KEY' }));
  process.exit(1);
}

const url = `${base.replace(/\/$/, '')}/v1/messages`;
const mkBody = m => ({
  model: m,
  max_tokens: 32,
  messages: [{ role: 'user', content: 'Reply only: ANTHROPIC_GATEWAY_OK' }]
});

async function firstModel() {
  const r = await fetch(`${base.replace(/\/$/, '')}/v1/models`, {
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
  });
  const data = await r.json().catch(() => ({}));
  return ((data.data || [])[0] || {}).id || null;
}

async function run() {
  const start = Date.now();
  let usedModel = model;
  let r = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(mkBody(usedModel))
  });
  let data = await r.json().catch(() => ({}));
  if (r.status === 404) {
    const fallback = await firstModel();
    if (fallback) {
      usedModel = fallback;
      r = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(mkBody(usedModel))
      });
      data = await r.json().catch(() => ({}));
    }
  }
  const text = ((data.content || [])[0] || {}).text || null;
  const out = {
    ok: r.ok,
    status: r.status,
    base_url: base,
    model: usedModel,
    latency_ms: Date.now() - start,
    id: data.id || null,
    content: text
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(r.ok ? 0 : 1);
}

run().catch(e => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
