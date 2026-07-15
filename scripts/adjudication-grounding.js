#!/usr/bin/env node
'use strict';
// adjudication-grounding.js — R1 of #3059 (#3747). Web-research grounding producer for the
// cross-model stuck-decision adjudication guardrail (adjudication-guardrail.js). For a novel /
// high-stakes decision it fetches CURRENT sources ($0 free-first via tavily-search-router,
// paid Tavily only within tavily-budget-governor caps), runs a sufficiency check, and returns a
// citation-bearing grounding string that adjudicate() injects into the panel prompt.
//
// Fail-safe contract (§3 of research/stuck-issue-resolution-protocol-3059.md): no key / outage /
// timeout / insufficient-or-uncited sources => returns null so the caller degrades to
// consensus-without-grounding. NEVER throws, NEVER prompts the human client. Naive RAG fails ~40%
// with confident-wrong grounding, so an uncited claim does NOT clear; on conflict, fresh sources win.
const { loadLocalEnvOnce } = require('./load-local-env');
const { routeSearch } = require('./tavily-search-router');

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESULTS = 4;
const MIN_SUFFICIENT_RESULTS = 1; // sufficiency floor — zero citable sources never clears
const MIN_CONTENT_CHARS = 40;     // trivial/empty content is not a citation
const SNIPPET_CHARS = 240;
const MAX_QUERY_CHARS = 380; // Tavily query upper bound

function buildQuery(question) {
  return String(question || '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_CHARS);
}

// Citable only if it carries a real source URL AND non-trivial content (mandatory-citation gate).
function citable(r) {
  return !!r && typeof r.url === 'string' && /^https?:\/\//.test(r.url)
    && typeof r.content === 'string' && r.content.trim().length >= MIN_CONTENT_CHARS;
}

// Live web fetch (Tavily /search, free-tier basic depth = $0). Injectable fetchImpl for tests.
async function tavilySearch(query, opts = {}) {
  const apiKey = opts.apiKey || process.env.TAVILY_API_KEY;
  const fetchImpl = opts.fetchImpl || global.fetch;
  if (!apiKey || typeof fetchImpl !== 'function') return { ok: false, reason: 'no-key-or-fetch' };
  try {
    const res = await fetchImpl(TAVILY_SEARCH_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', include_answer: false,
        max_results: opts.maxResults || DEFAULT_MAX_RESULTS }),
      signal: AbortSignal.timeout(opts.timeoutMs || DEFAULT_TIMEOUT_MS),
    });
    if (!res || !res.ok) return { ok: false, reason: `http-${res && res.status}` };
    const json = await res.json();
    return { ok: true, results: Array.isArray(json && json.results) ? json.results : [] };
  } catch (err) { return { ok: false, reason: `fetch-error:${err && err.message}` }; }
}

// Render a grounding string where EVERY line carries its source URL. Returns null below the
// sufficiency floor so an uncited/empty result never fabricates grounding.
function renderGrounding(results) {
  const cited = (results || []).filter(citable).slice(0, DEFAULT_MAX_RESULTS);
  if (cited.length < MIN_SUFFICIENT_RESULTS) return null;
  const lines = cited.map((r) => `- ${(r.title || 'source').trim()} (${r.url}): ${r.content.trim().slice(0, SNIPPET_CHARS)}`);
  return { grounding: `Fetched ${cited.length} CURRENT web source(s) — prefer these over stale training priors and flag any conflict:\n${lines.join('\n')}`,
    sources: cited.map((r) => r.url) };
}

/**
 * Produce web-research grounding for a novel/high-stakes decision.
 * Free-first + budget-governed; sufficiency-gated; citation-bearing; fail-safe null.
 * @param {string} question decision question
 * @param {object} [opts] apiKey/fetchImpl (test injection), timeoutMs, maxResults, budget flags
 * @returns {Promise<{grounding:string, sources:string[], route:object}|null>}
 */
async function produceGrounding(question, opts = {}) {
  try {
    loadLocalEnvOnce();
    const query = buildQuery(question);
    if (!query) return null;
    // Free-first + budget routing decision (G8 observability; G3 zero-cost honored by basic depth).
    const route = routeSearch({ query, freeEligible: opts.freeEligible !== false, spentUsd: opts.spentUsd,
      tavilyAvailable: opts.tavilyAvailable, policyAllowsTavily: opts.policyAllowsTavily, allowPaid: opts.allowPaid });
    const search = await tavilySearch(query, opts);
    if (!search.ok) return null; // outage / no-key => consensus-without-grounding (never a client prompt)
    const rendered = renderGrounding(search.results);
    if (!rendered) return null;  // insufficient / uncited => no clear
    return { grounding: rendered.grounding, sources: rendered.sources, route };
  } catch { return null; } // belt-and-suspenders: the producer must never throw into the decision path
}

module.exports = { produceGrounding, buildQuery, citable, renderGrounding, tavilySearch,
  TAVILY_SEARCH_URL, MIN_SUFFICIENT_RESULTS, MIN_CONTENT_CHARS };

if (require.main === module) {
  produceGrounding(process.argv.slice(2).join(' ')).then((g) => {
    process.stdout.write(JSON.stringify(g, null, 2) + '\n');
    process.exit(g ? 0 : 2);
  });
}
