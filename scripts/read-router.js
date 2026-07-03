#!/usr/bin/env node
'use strict';
// read-router.js (#3130, Epic #3124 D5): tiered READ-router. routeQuery(queryClass) returns the
// sub-wiki + retrieval strategy that loads the minimum context. Index-first + grep is the $0 portable
// floor; heavy multi-page sweeps route to a sub-agent that returns a 1-2K digest (keeping big reads
// out of the main window). Embeddings/graph are DEFERRED (replay-eval-gated). recallMiss() emits a
// schema-v3 G8 signal so index-first degradation is observed, not silent. Deterministic, local, $0.
const path = require('path');

const ROUTES = {
  symbol: { subWiki: 'wiki/code/symbols', strategy: 'grep-index' },
  signature: { subWiki: 'wiki/code/symbols', strategy: 'grep-index' },
  concept: { subWiki: 'wiki/code/concepts', strategy: 'index-first' },
  ticket: { subWiki: 'wiki/work-log/tickets', strategy: 'mirror-lookup' },
  pr: { subWiki: 'wiki/work-log/prs', strategy: 'mirror-lookup' },
  governance: { subWiki: 'wiki/wisdom', strategy: 'index-first' },
  wisdom: { subWiki: 'wiki/wisdom', strategy: 'index-first' },
  'heavy-sweep': { subWiki: 'multi', strategy: 'sub-agent-digest' },
};
const DEFAULT_ROUTE = { subWiki: 'wiki/index.md', strategy: 'index-first' };

/** Route a query-class to its sub-wiki + retrieval strategy (unknown -> index-first floor).
 * @param {string} queryClass query category. @returns {object} {queryClass, subWiki, strategy, fallback}. */
function routeQuery(queryClass) {
  const entry = ROUTES[queryClass] || DEFAULT_ROUTE;
  return { queryClass, ...entry, fallback: 'index-first' };
}

/** Emit a recall-miss G8 signal (index-first degradation canary). Resilient: falls back to plain append.
 * @param {string} query the missed query. @param {string} [file] target jsonl. @returns {boolean} emitted. */
function recallMiss(query, file) {
  const target = file || path.join(process.env.HOME || '/tmp', '.megingjord', 'recall-miss.jsonl');
  const event = {
    ts: new Date().toISOString(),
    version: 3,
    service: 'read-router',
    env: 'local',
    event: 'recall-miss',
    _summary: `index-first recall miss for query: ${String(query).slice(0, 80)}`,
  };
  try {
    require('./event-schema-v3').emitV3(event, target);
    return true;
  } catch {
    try {
      const fs = require('fs');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, `${JSON.stringify(event)}\n`);
      return true;
    } catch {
      return false;
    }
  }
}

function main() {
  const argv = process.argv.slice(2);
  const classIndex = argv.indexOf('--class');
  const queryClass = classIndex !== -1 ? argv[classIndex + 1] : null;
  if (!queryClass) {
    process.stdout.write(
      `query-classes: ${Object.keys(ROUTES).join(', ')} (default -> index-first)\n`
    );
    return;
  }
  process.stdout.write(`${JSON.stringify(routeQuery(queryClass), null, 2)}\n`);
}

if (require.main === module) main();
module.exports = { routeQuery, recallMiss, ROUTES };
