// Phase 2 / #784 — repo-context RAG search MVP
// MCP-first when capability allows; ripgrep-fallback otherwise.
// Returns top-k snippets with file path + line numbers.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FETCH_TIMEOUT_MS = 4000;
const RG_TIMEOUT_MS = 6000;
const DEFAULT_TOP_K = 5;
const SNIPPET_CONTEXT_LINES = 3;
const MANIFEST_PATH = path.join(process.cwd(), '.dashboard', 'capabilities.json');

function _capability() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch { return null; }
}

function _ragUrl() {
  const cap = _capability();
  if (!cap?.mcp?.rag_server?.reachable) return null;
  return process.env.MCP_RAG_URL || cap?.mcp?.rag_server?.url || null;
}

async function _searchViaMcp(url, query, k) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${url}/search?q=${encodeURIComponent(query)}&k=${k}`, { signal: controller.signal });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.results || null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function _searchViaRipgrep(query, k) {
  try {
    const safeQuery = query.replace(/[^\w\s.-]/g, ' ').trim();
    if (!safeQuery) return [];
    const cmd = `rg --json --max-count ${k} -C ${SNIPPET_CONTEXT_LINES} -- ${JSON.stringify(safeQuery)}`;
    const out = execSync(cmd, { encoding: 'utf8', timeout: RG_TIMEOUT_MS, maxBuffer: 1024 * 1024 });
    const lines = out.trim().split('\n').filter(Boolean);
    const matches = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return matches
      .filter(m => m.type === 'match')
      .slice(0, k)
      .map(m => ({
        path: m.data?.path?.text,
        line: m.data?.line_number,
        snippet: m.data?.lines?.text?.trim() || '',
        source: 'ripgrep',
      }));
  } catch { return []; }
}

async function search(query, k = DEFAULT_TOP_K) {
  if (!query || typeof query !== 'string') return { results: [], source: 'invalid-query' };
  const url = _ragUrl();
  if (url) {
    const mcpResults = await _searchViaMcp(url, query, k);
    if (mcpResults) return { results: mcpResults, source: 'mcp' };
  }
  const rgResults = _searchViaRipgrep(query, k);
  return { results: rgResults, source: 'ripgrep-fallback' };
}

module.exports = { search, _capability, _ragUrl, _searchViaRipgrep, DEFAULT_TOP_K };

if (require.main === module) {
  const query = process.argv.slice(2).join(' ');
  if (!query) { process.stderr.write('Usage: rag-search.js <query>\n'); process.exit(1); }
  search(query).then(r => process.stdout.write(JSON.stringify(r, null, 2) + '\n'));
}
