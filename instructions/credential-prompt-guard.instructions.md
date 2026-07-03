# Credential Prompt Guard (#2569)

## Binding rule (forbidden behavior)

**The operator MUST NOT ask the client for a credential, API key, token, password, or login that is
already available locally.** The client is not the credential transport layer for operator work (G1), and
a secret already stored locally must never be re-exposed in chat (G4). Before prompting the client for any
secret, the operator MUST first resolve local availability.

## Pre-prompt guard contract

Before asking the client for any credential/token/API-key/login:

1. **Check local availability first** — call
   `require('scripts/global/credential-availability.js').preCredentialPromptCheck([VAR_NAMES])`.
   It returns `{ available, absent, action }` by probing `process.env` and the approved local `.env`
   (via #2645's `loadLocalEnv`), value-free.
2. **If available (`action: 'use-local'`)** — use the local secret. Do NOT prompt the client.
3. **If absent (`action: 'report-absent-no-prompt'`)** — report the absence and resolve via
   **direct terminal entry or an approved auth flow**. NEVER request the raw secret value in chat.
4. **Source the local env first** — a fresh session may not have hydrated `.env`; `loadLocalEnv` /
   `loadLocalEnvOnce` (see `instructions/hamr-routing.instructions.md`) makes the keys visible, so
   "I see no key" is not a reason to prompt the client.

## Catalog of secret-prompt paths (AC1)

This rule applies to every surface that can ask the client for a secret:

- a natural-language chat prompt ("please paste your … API key");
- an `AskUserQuestion` / interactive question requesting a credential;
- an interactive auth/login prompt where a local approved credential already exists.

It does NOT apply to ordinary non-secret clarification ("which file?", "what color?"); the conservative
`classifyCredentialRequest` detector distinguishes the two so the guard does not over-block (AC3).

## Recurrence cases (regression-anchored)

- 2026-06-01: operator asked the client for a **Tavily API key** already present in `.env`.
- 2026-05-27: repeated Tavily prompt despite the local `.env` (also captured by Epic #2291).
- GitHub auth/login already available locally.

`isSecretLocallyAvailable('TAVILY_API_KEY')` / `isSecretLocallyAvailable('GITHUB_CLIENT_SECRET')` return
`true` when present — so the prompt is forbidden.

## Boundary (de-conflict)

- **#2645 (closed)** owns hydration (making `.env` visible); this guard CONSUMES it.
- **Epic #2291 / #2292** own global cross-entrypoint hydration normalization, the entrypoint inventory,
  and the secret-storage-strategy decision. This guard does NOT re-run that inventory or decide storage.

## Enforcement

Deterministic helper: `scripts/global/credential-availability.js`. Tests:
`tests/credential-availability.spec.js` (availability, anti-over-block, absent-action, recurrence cases),
`tests/credential-prompt-guard-doclint.spec.js` (asserts this forbidden-behavior clause is present).
