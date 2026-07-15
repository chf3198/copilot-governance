#!/usr/bin/env node
'use strict';
// memory-write-router.js (#3128, Epic #3124 D4): map a fact-class to its SINGLE canonical home, so
// durable facts stop scattering across surfaces (the MEMORY.md 4-copy problem). Pure function + CLI.
// Deterministic, local, $0 — no LLM, no network. The table is data (settings-driven, G5).

// D4 canonical-home table: factClass -> { home, durability, private }.
const ROUTES = {
  rule: { home: 'instructions/', durability: 'asset', private: false },
  runbook: { home: 'docs/howto/', durability: 'asset', private: false },
  'durable-pattern': { home: 'wiki/wisdom/project/', durability: 'asset', private: false },
  'cross-project-wisdom': { home: 'wiki/wisdom/global/', durability: 'asset', private: false },
  'code-semantics': { home: 'wiki/code/', durability: 'mirror', private: false },
  'ticket-history': { home: 'wiki/work-log/', durability: 'mirror', private: false },
  'operator-pref': { home: '~/.claude (operator memory)', durability: 'asset', private: true },
  incident: { home: 'incidents.jsonl', durability: 'runtime', private: false },
  'baton-event': { home: 'events.jsonl', durability: 'runtime', private: false },
};

/** Route a fact-class to its single canonical home.
 * @param {string} factClass one of ROUTES keys. @returns {object} {ok, home, durability, private} or {ok:false}. */
function route(factClass) {
  const entry = ROUTES[factClass];
  if (!entry)
    return { ok: false, reason: `unknown fact-class '${factClass}'`, known: Object.keys(ROUTES) };
  return { ok: true, factClass, ...entry };
}

function main() {
  const argv = process.argv.slice(2);
  const classIndex = argv.indexOf('--class');
  const factClass = classIndex !== -1 ? argv[classIndex + 1] : null;
  if (!factClass) {
    process.stdout.write(`fact-classes: ${Object.keys(ROUTES).join(', ')}\n`);
    return;
  }
  const result = route(factClass);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
}

if (require.main === module) main();
module.exports = { route, ROUTES };
