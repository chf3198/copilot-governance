#!/usr/bin/env node
'use strict';
// mcp-project-state.js — MCP /project-state handler (#2056)
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { sign } = require('./baton-signing.js');
const AUDIT = path.join(os.homedir(), '.megingjord', 'mcp-project-state-audit.jsonl');
const SUBTREES = {
  code: ['code'], 'work-log': ['work-log'],
  wisdom: [path.join('wisdom', 'global'), path.join('wisdom', 'project')],
  all: ['code', 'work-log', path.join('wisdom', 'global'), path.join('wisdom', 'project')],
};
function resolveWikiRoot() {
  return [process.env.WIKI_DIR, path.join(os.homedir(), '.copilot', 'wiki'),
    path.join(__dirname, '..', '..', 'wiki')].find((d) => d && fs.existsSync(d)) || null;
}
function collectMd(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? collectMd(full) : (e.name.endsWith('.md') ? [full] : []);
  });
}
function scoreFile(fp, filter) {
  if (!filter) return 1;
  try {
    const text = fs.readFileSync(fp, 'utf8').toLowerCase();
    return filter.toLowerCase().split(/\s+/).filter((w) => w && text.includes(w)).length;
  } catch { return 0; }
}
function decodeToken(tok) {
  if (!tok) return 0;
  try { return parseInt(Buffer.from(tok, 'base64').toString(), 10) || 0; } catch { return 0; }
}
function encodeToken(n) { return Buffer.from(String(n)).toString('base64'); }
function appendAudit(entry) {
  try {
    const dir = path.dirname(AUDIT);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(AUDIT, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* best-effort */ }
}
function parseParams(params) {
  const par = params || {};
  return {
    query_type: par.query_type || 'all',
    filter: par.filter || '',
    page_token: par.page_token || null,
    safeSize: Math.min(Math.max(1, Number(par.page_size) || 10), 50),
    signer: par.signer || 'Clio Harper',
    mutation: par.mutation || null,
  };
}

function paginate(allFiles, page_token, safeSize, wikiRoot) {
  const offset = decodeToken(page_token);
  const slice = allFiles.slice(offset, offset + safeSize);
  const next = offset + safeSize;
  const next_page_token = next < allFiles.length ? encodeToken(next) : null;
  const items = slice.map((e) => ({
    path: e.path.replace(wikiRoot + path.sep, ''), score: e.score,
  }));
  return { items, next_page_token };
}

async function handle(params, options) {
  const cfg = parseParams(params);
  const wikiRoot = (options || {}).wikiRoot || resolveWikiRoot();
  const ts = new Date().toISOString();
  const audit_id = `pstate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!wikiRoot || !require('node:fs').existsSync(wikiRoot)) {
    appendAudit({ ts, audit_id, query_type: cfg.query_type, filter: cfg.filter,
      error: 'wiki_root_not_found', signer: cfg.signer });
    return { ok: false, error: 'wiki_root_not_found', audit_id };
  }
  const allFiles = (SUBTREES[cfg.query_type] || SUBTREES.all)
    .flatMap((s) => collectMd(path.join(wikiRoot, s))
      .map((fp) => ({ path: fp, score: scoreFile(fp, cfg.filter) })))
    .filter((f) => !cfg.filter || f.score > 0)
    .sort((a, b) => b.score - a.score);
  const { items, next_page_token } = paginate(allFiles, cfg.page_token, cfg.safeSize, wikiRoot);
  let sig_block = null;
  if (cfg.mutation) {
    const raw = await sign(JSON.stringify({ mutation: cfg.mutation, ts, signer: cfg.signer }));
    sig_block = { signature: raw.signature, key_id: raw.key_id,
      timestamp: raw.timestamp, tier: raw.tier, public_key: raw.publicKey };
  }
  appendAudit({ ts, audit_id, query_type: cfg.query_type, filter: cfg.filter || null,
    page_token: cfg.page_token, page_size: cfg.safeSize, total_candidates: allFiles.length,
    returned: items.length, signer: cfg.signer, mutation: cfg.mutation || null,
    signed: !!sig_block });
  return { ok: true, items, total_candidates: allFiles.length,
    page_size: cfg.safeSize, next_page_token, audit_id, sig_block };
}
module.exports = { handle, resolveWikiRoot, decodeToken, encodeToken, SUBTREES };
if (require.main === module) {
  const cliArgs = process.argv[2] ? JSON.parse(process.argv[2]) : {};
  handle(cliArgs).then((r) => process.stdout.write(JSON.stringify(r, null, 2) + '\n'));
}
