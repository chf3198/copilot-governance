#!/usr/bin/env node
// tier: 2
// mailbox-client.js — operator-side R2 mailbox client (#918).
// Per HAMR v3.2 §R2: signed Google A2A envelopes; reuses baton-signing.js (#894).
'use strict';
require('./load-local-env').loadLocalEnvOnce();
const crypto = require('node:crypto');
const baton = require('./baton-signing');

const HAMR_WORKER_URL = process.env.HAMR_WORKER_URL || 'https://hamr.chf3198.workers.dev';
const DEFAULT_TTL_MS = 60 * 60 * 1000;

function uuidv7() {
  // RFC 9562 UUIDv7: 48-bit ms timestamp + 12-bit rand_a + 62-bit rand_b + version/variant bits.
  const ms = BigInt(Date.now());
  const rand = crypto.randomBytes(10);
  const buf = Buffer.alloc(16);
  buf.writeUIntBE(Number((ms >> 16n) & 0xffffffffn), 0, 4);
  buf.writeUIntBE(Number(ms & 0xffffn), 4, 2);
  rand.copy(buf, 6);
  buf[6] = (buf[6] & 0x0f) | 0x70; // version 7
  buf[8] = (buf[8] & 0x3f) | 0x80; // RFC variant
  const hex = buf.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildEnvelope({ recipient, body, ttlMs = DEFAULT_TTL_MS, publisherKeyId }) {
  return {
    headers: {
      nonce: uuidv7(),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      publisher_key_id: publisherKeyId,
      recipient_key_id: recipient,
    },
    body,
  };
}

async function sendMessage({ recipient, body, ttlMs, workerUrl = HAMR_WORKER_URL }) {
  const initSig = await baton.sign('hamr-mailbox-write');
  const envelope = buildEnvelope({ recipient, body, ttlMs, publisherKeyId: initSig.key_id });
  const canonical = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64').replace(/=+$/, '');
  const sigPayload = await baton.sign(canonical);
  const resp = await fetch(`${workerUrl}/mailbox/write`, {
    method: 'POST',
    headers: {
      'authorization': 'DPoP ' + initSig.signature,
      'x-hamr-key-id': sigPayload.key_id,
      'x-hamr-signature': sigPayload.signature,
      'x-hamr-canonical': canonical,
      'content-type': 'application/json',
    },
    body: JSON.stringify(envelope),
  });
  const j = await resp.json();
  return { status: resp.status, body: j, envelope };
}

async function pollMessages({ recipient, since, workerUrl = HAMR_WORKER_URL }) {
  const url = new URL(`${workerUrl}/mailbox/read`);
  url.searchParams.set('recipient', recipient);
  if (since) url.searchParams.set('since', since);
  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'authorization': 'DPoP placeholder' },
  });
  return { status: resp.status, body: await resp.json() };
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'send') {
    const recipient = rest[0]; const body = rest.slice(1).join(' ') || '{}';
    if (!recipient) { console.error('usage: mailbox-client.js send <recipient> <body>'); process.exit(1); }
    const result = await sendMessage({ recipient, body: { text: body } });
    console.log(JSON.stringify(result, null, 2));
  } else if (cmd === 'poll') {
    const recipient = rest[0]; const since = rest[1];
    if (!recipient) { console.error('usage: mailbox-client.js poll <recipient> [since-iso]'); process.exit(1); }
    const result = await pollMessages({ recipient, since });
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error('usage: mailbox-client.js <send|poll> <recipient> [...]');
    process.exit(1);
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { sendMessage, pollMessages, buildEnvelope, uuidv7 };
