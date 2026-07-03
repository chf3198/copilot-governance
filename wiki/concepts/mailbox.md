---
title: HAMR R2 Mailbox
type: concept
created: 2026-05-05
updated: 2026-05-05
tags: [hamr, wave3, mailbox, r2, a2a, dpop, replay-protection]
related: ["[[hamr-v3-2-2026-05-04]]", "[[hamr-v3-2-1-2026-05-05]]", "[[hamr-core-worker]]", "[[baton-signing]]"]
status: draft
---

# HAMR R2 Mailbox

## Purpose

Production R2 JSONL mailbox + signed Google A2A envelopes per
HAMR v3.2 §5 child 5 + v3.2 §R2 + v3.2.1 §R9 (DC-1 from S6
threat model). Replaces 501 placeholders from #910.

Production routes (live at `https://hamr.chf3198.workers.dev`):

| Route | Method | Status |
|---|---|---|
| `/mailbox/write` | POST | 200 (accepted) / 401 / 400 / 409 (replay_detected) |
| `/mailbox/read?recipient=<key_id>&since=<iso>` | GET | 200 (JSON `{messages, next_since}`) |

## Storage

- R2 bucket `hamr-bundles` (reused), prefix `mailboxes/<recipient>/<yyyy-mm-dd>.jsonl`. One JSONL line per envelope.
- KV namespace `HAMR_KV` (reused) holds replay-protection nonces under `nonce:<uuidv7>` keys with TTL = `min(expires_at - now, 24h)`.

## Envelope schema

```json
{
  "headers": {
    "nonce": "<uuidv7>",
    "expires_at": "<iso-8601>",
    "publisher_key_id": "op-<sha-prefix>",
    "recipient_key_id": "op-<sha-prefix>"
  },
  "body": {  /* opaque application payload */  }
}
```

## Auth + signing

Per v3.2 §R2: each request carries `authorization: DPoP <signature>` + `x-hamr-key-id` + `x-hamr-signature` + `x-hamr-canonical` (base64 of canonical JSON). Worker verifies Ed25519 signature over the canonical bytes against `PUBLISHER_KEYRING` (set as wrangler secret). Signature is over the canonical-form-without-signature string itself (UTF-8 bytes), not a base64-decoded version.

## Replay protection

Worker checks `HAMR_KV.get('nonce:<uuid>')` before accepting. If non-null, returns 409 `replay_detected`. On accept, writes nonce with TTL = remaining-envelope-lifetime (60 s floor, 24 h ceiling).

## Operator-side modules

- `scripts/global/mailbox-client.js` — `sendMessage()` + `pollMessages()`. Uses `baton-signing.js` (#894) for envelope signing. Reads `HAMR_WORKER_URL` env.
- `scripts/global/mailbox-outbox.js` — local JSONL outbox at `~/.megingjord/mailbox-outbox.jsonl`. Queues outbound when Worker unreachable; flush via `mailbox-outbox.js flush`.

## Stable operator key

Wave 3 adds `OPERATOR_KEY_SEED_B64` env override to `baton-signing.js`: if set (32-byte base64 seed), the session key derives deterministically (`tier: 'T3-env'`). Otherwise T4 ephemeral. The operator's seed in `.env` + matching `PUBLISHER_KEYRING` Worker secret enables stable mailbox routing.

Bootstrap flow:
1. Generate seed: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`
2. Add to `.env`: `OPERATOR_KEY_SEED_B64=<seed>`
3. Derive public key: `OPERATOR_KEY_SEED_B64=<seed> node -e "..." → KEY_ID + PUBKEY`
4. Set Worker secret: `echo '{"<KEY_ID>":"<PUBKEY>"}' | wrangler secret put PUBLISHER_KEYRING --name hamr`

## Strict-superset guarantee

Existing `agent-coord-remote.js` (megingjord-coord Worker, #740/#785) continues to function unchanged. HAMR mailbox is the new path; migration of operator scripts to HAMR mailbox is a follow-up ticket.

## v3.2.1 R9 patterns applied

- **R9.3** sequential dispatch: KV/R2 ops bounded; Worker never hangs beyond ~3 s.
- **R9.4** idempotent: same `(publisher_key_id, nonce)` always returns same write result; replay yields 409 deterministically.
- **R9** failover: `mailbox-outbox.js` queues writes when Worker unreachable; `flushPending(client)` reconciles on substrate-health recovery.

## References

- HAMR v3.2 §R2 + §5 child 5: `research/hamr-v3-2-2026-05-04.md` (#890).
- v3.2.1 §R9 + DC-1: `research/hamr-v3-2-1-2026-05-05.md` (#907).
- Baton signing (#894): `scripts/global/baton-signing.js`.
- HAMR core Worker (#910): `cloudflare/hamr/`.
- Implementation: this PR (#918).
