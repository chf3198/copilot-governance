// Default side-effecting deps for fleet local RAG (#2856 P1-0 child of #2802; design D14, G4).
// `defaultEmbedder` calls a LOCAL embedding model on loopback ONLY (Ollama /api/embeddings) — zero
// external egress, so proprietary code/context never leaves the machine. It resolves to a numeric vector,
// or null on any error / when no local model is reachable (→ caller falls back to wiki-search). Never
// rejects. `defaultFallback` reuses the shipped compiled-wiki search (#2815). Both injectable in
// fleet-rag-local.js so unit/stress tests run with no network and no local model.
const http = require('node:http');
const { wikiContext } = require('./fleet-context-bundle');

const LOCAL_EMBED_HOST = '127.0.0.1'; // loopback only — never an external host (G4 zero-egress)
const DEFAULT_EMBED_PORT = 11434; // local Ollama default (read at call time so tests can point at a stub)
const EMBED_TIMEOUT_MS = 8000;
const embedPort = () => Number(process.env.MEGINGJORD_EMBED_PORT) || DEFAULT_EMBED_PORT;
const embedModel = () => process.env.MEGINGJORD_EMBED_MODEL || 'nomic-embed-text';
const MAX_EMBED_BYTES = 4 * 1024 * 1024; // cap the embed response — a rogue local model can't OOM us (G6)

// A valid embedding is a non-empty array of finite numbers — anything else (strings, NaN, non-array) → null.
function asVector(embedding) {
  return Array.isArray(embedding) && embedding.length > 0 && embedding.every(Number.isFinite)
    ? embedding : null;
}

function defaultEmbedder(text) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ model: embedModel(), prompt: String(text == null ? '' : text) });
    const req = http.request({
      host: LOCAL_EMBED_HOST, port: embedPort(), path: '/api/embeddings', method: 'POST',
      timeout: EMBED_TIMEOUT_MS, headers: { 'content-type': 'application/json' },
    }, (res) => {
      let body = ''; let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_EMBED_BYTES) { req.destroy(); resolve(null); return; } // bound response memory
        body += chunk;
      });
      res.on('end', () => {
        try { resolve(asVector(JSON.parse(body).embedding)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null)); // no local model reachable → graceful null (caller falls back)
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

// Fallback retrieval: the shipped compiled-wiki search (#2815) — keyword/index, not embeddings (G6/D13).
function defaultFallback(query, topK = 3) {
  return wikiContext(query, topK);
}

module.exports = { defaultEmbedder, defaultFallback, asVector, LOCAL_EMBED_HOST };
