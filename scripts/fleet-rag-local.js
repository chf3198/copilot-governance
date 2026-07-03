// Local embeddings / RAG retrieval for fleet context (#2856 P1-0 child of #2802; design D14, G4).
// `localRetrieve` embeds the query with a LOCAL model and ranks a (optionally pre-embedded) corpus by
// cosine similarity, returning a manifest-compatible top-K (D15). When no local embedder is present it
// degrades to wiki-search (tier-graceful, G6) — the optimization is local embeddings, the baseline is the
// shipped wiki-search (no parallel RAG, D13). Proprietary context never leaves the machine (G4). Pure
// ranking logic; embed + fallback injectable so tests run with no network and no local model.
const { defaultEmbedder, defaultFallback, asVector } = require('./fleet-rag-embedder');

const SCHEMA = 'fleet-rag/v1';
const MAX_CORPUS = 5000; // bound the in-memory scored set — a huge corpus can't OOM us (G6). For a larger
// working set, pre-filter into an index upstream; this slice ranks a bounded candidate set.
const EMBED_CONCURRENCY = 8; // embed docs in bounded-parallel windows: fast (G7) without flooding the model
const MAX_TEXT_CHARS = 256 * 1024; // clamp query/doc text before embedding — a 500MB string can't OOM us (G6)
const clampText = (text) => String(text == null ? '' : text).slice(0, MAX_TEXT_CHARS);

// Map `items` through async `fn` in windows of `limit` — bounded concurrency (parallel within a window,
// not a 5000-socket flood). Order-preserving.
async function mapBounded(items, limit, fn) {
  const out = [];
  for (let start = 0; start < items.length; start += limit) {
    out.push(...await Promise.all(items.slice(start, start + limit).map(fn)));
  }
  return out;
}

// Cosine similarity of two equal-length numeric vectors. Returns 0 (never NaN) for mismatched / empty /
// zero / non-finite vectors, so ranking is always well-defined on adversarial input.
function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecA.length !== vecB.length) return 0;
  let dot = 0; let magA = 0; let magB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    dot += vecA[i] * vecB[i]; magA += vecA[i] * vecA[i]; magB += vecB[i] * vecB[i];
  }
  if (!(magA > 0) || !(magB > 0)) return 0; // !(>0) also rejects NaN magnitudes
  const score = dot / (Math.sqrt(magA) * Math.sqrt(magB));
  return Number.isFinite(score) ? score : 0;
}

// Embed `text`, returning a non-empty numeric vector or null — never throwing (a throwing/unreachable
// embedder degrades to null so the caller falls back).
async function safeEmbed(embed, text) {
  try { const vec = await embed(clampText(text)); return Array.isArray(vec) && vec.length ? vec : null; }
  catch { return null; }
}

// A doc's vector: its pre-embedded `.vector` if it passes the SAME finite-number validation as a freshly
// fetched embedding (asVector) — no re-embed; otherwise embed its text. Consistent validation either way.
async function docVector(doc, embed) {
  const pre = doc && asVector(doc.vector);
  if (pre) return pre;
  // nullish check (not truthiness) so a falsy-but-present text (0, false) is embedded, not coerced to ''.
  const text = typeof doc === 'string' ? doc : (doc && doc.text != null ? doc.text : '');
  return safeEmbed(embed, text);
}

// The wiki-search fallback path — never hard-fails even if the injected fallback throws (returns []).
async function fallbackResult(fallback, query, topK) {
  let raw;
  try { raw = await fallback(query, topK); } catch { raw = []; }
  if (!Array.isArray(raw)) raw = []; // a truthy non-array fallback result must not make .map() throw
  return { source: 'wiki-fallback', embedded: false, schema: SCHEMA, hits: raw.map((doc) => ({ doc, score: null })) };
}

// localRetrieve(opts) -> { source, embedded, schema, hits:[{doc,score}] }. opts.query · opts.corpus
// ([string | {text?, vector?}]) · opts.topK · opts.embed / opts.fallback (injectable).
async function localRetrieve(opts = {}) {
  const { query, corpus = [], topK = 3 } = opts;
  const embed = opts.embed || defaultEmbedder;
  const fallback = opts.fallback || defaultFallback;
  const queryVec = await safeEmbed(embed, query);
  if (!queryVec) return fallbackResult(fallback, query, topK);
  const candidates = corpus.slice(0, MAX_CORPUS); // bounded candidate set (memory guard)
  const scored = (await mapBounded(candidates, EMBED_CONCURRENCY, async (doc) => {
    const vec = await docVector(doc, embed);
    return vec ? { doc, score: cosineSimilarity(queryVec, vec) } : null;
  })).filter(Boolean);
  scored.sort((first, second) => second.score - first.score);
  return {
    source: 'local-embeddings', embedded: true, schema: SCHEMA,
    corpusTruncated: corpus.length > MAX_CORPUS, hits: scored.slice(0, topK),
  };
}

module.exports = { localRetrieve, cosineSimilarity, safeEmbed, docVector, SCHEMA };
