# Wiki Archive (Tier-0 + reconcile cache) — #3067

Generated artifacts that make the Three-Wiki stores self-healing and outage-survivable.
Populated by `scripts/wiki/reconcile.js` and `scripts/wiki/archive-snapshot.js` (the
`wiki-reconcile-cron.yml` workflow runs them daily at 07:30 UTC). Do not hand-edit.

## Subdirectories

- `static/` — Tier-0 last-known-good snapshot: `wiki-snapshot.zip` (Wiki A + B + C) plus
  `wiki-snapshot.manifest.json` — an Ed25519-signed SHA256 manifest. Served when gh has
  been unreachable for over 48h. Verify offline with
  `archive-snapshot.js#verifySnapshot(zipBuffer, manifest)` (recompute the zip SHA256 and
  check the signature against `public_key_hex`).
- `cache/` — `work-log-cache.json`: a checksum-validated map of issue number to
  `source_sha256`, used as the Wiki B reconcile fallback when gh is unreachable. A
  checksum mismatch is treated as no cache (fail toward Tier-2, never a silent no-op).

## Cache-use ladder (AC2)

- Fresh cache (under 24h) during an outage → Tier-1 advisory, cache age recorded.
- Cache over 24h AND gh unreachable → Tier-2 escalation.
- Both paths fail (no cache) → always Tier-2 — never silent.
- Outage over 48h → serve the last-known-good `static/wiki-snapshot.zip`.

## Local fallback

If the cron has not run, rebuild the search index locally with `npm run wiki:reindex`,
and (with the `zip` CLI present) regenerate the Tier-0 archive with
`node scripts/wiki/archive-snapshot.js`.
