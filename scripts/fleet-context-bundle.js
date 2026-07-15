// Fleet context-bundle assembler (#2802 P1-0; design D12/D15). Gives a fleet model the MOST context
// possible before a dev/review dispatch: the ticket (live work-log), a lightweight repo-map of named
// files (Aider-style signatures, no tree-sitter dep), and compiled-wiki hits — plus a manifest so a
// downstream dispatch fetches only the delta (D15). Graceful (G6): a missing source degrades to
// {available:false}, never throws. Privacy (G4): assembles LOCAL context for a LOCAL fleet model.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RUN_TIMEOUT_MS = 15000; // per-source subprocess cap; missing/slow source degrades gracefully
const MAX_FILE_BYTES = 262144; // #2802: skip files >256KB (OOM guard) — repo-map is for source files

function runQuiet(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: RUN_TIMEOUT_MS });
  } catch (error) {
    // G8: graceful-silent by default, but surface WHY under an opt-in flag. Logs the command HEAD
    // + error code only (no captured output) so a missing/unauth `gh` is diagnosable, secret-safe (G4).
    if (process.env.MEGINGJORD_FLEET_CTX_DEBUG) {
      process.stderr.write(`[fleet-context] source unavailable: ${command.split(' ')[0]} (${error.code || error.message})\n`);
    }
    return '';
  }
}

// Live work-log for a ticket: title + body + comment bodies (the design lives in #2792's comments).
function ticketContext(number) {
  if (number == null) return null;
  // #2819 security: only a positive integer reaches the shell — blocks command injection.
  if (!Number.isInteger(number) || number <= 0) return { number, available: false };
  const raw = runQuiet(`gh issue view ${number} --json title,body,comments`);
  if (!raw) return { number, available: false };
  try {
    const json = JSON.parse(raw);
    return {
      number, title: json.title, body: json.body, available: true,
      comments: (json.comments || []).map((comment) => comment.body),
    };
  } catch (error) { return { number, available: false }; }
}

// Lightweight repo-map: top-level fn/class/export signatures of named files (no heavy parser).
function repoMap(relPaths = [], root = process.cwd()) {
  const resolvedRoot = path.resolve(root);
  return (relPaths || []).map((relPath) => {
    const full = path.resolve(resolvedRoot, relPath);
    // #2819 security: refuse paths that escape root (e.g. '../') — blocks path traversal.
    // Note: byte-exact prefix match — correct on the Tier-1 Linux baseline (case-sensitive FS); a
    // case-insensitive FS (macOS APFS / Windows NTFS) could over-reject a valid casing variant (G5 edge).
    if (full !== resolvedRoot && !full.startsWith(resolvedRoot + path.sep)) {
      return { path: relPath, available: false };
    }
    let stat;
    try { stat = fs.statSync(full); } catch (error) { return { path: relPath, available: false }; }
    // #2802 robustness: skip non-files + oversize files (OOM guard for huge logs/data dumps).
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return { path: relPath, available: false };
    const buffer = fs.readFileSync(full);
    // Binary heuristic: a NUL byte ⇒ skip. Tuned for UTF-8 source (the harness corpus); a UTF-16
    // text file would false-positive, which is an acceptable skip — repo-map targets UTF-8 code.
    if (buffer.includes(0)) return { path: relPath, available: false };
    const source = buffer.toString('utf8');
    const signatures = (source.match(/^\s*(async\s+)?(function|class|module\.exports|exports\.)[^\n{=]*/gm)
      || []).map((line) => line.trim()).slice(0, 40);
    return { path: relPath, symbols: signatures, available: true };
  });
}

// Compiled-wiki (A/B/C) search, if present on this host (graceful when absent).
function wikiContext(query, max = 3) {
  const searcher = path.join(process.env.HOME || '', '.copilot/scripts/wiki-search.js');
  if (!query || !fs.existsSync(searcher)) return [];
  const output = runQuiet(`node ${searcher} ${JSON.stringify(query)}`);
  return output ? output.split('\n').filter(Boolean).slice(0, max) : [];
}

// D15 manifest: declares what IS bundled so a downstream dispatch fetches only the delta.
function buildManifest(parts) {
  const included = Object.keys(parts).filter((key) => {
    const value = parts[key];
    return value && (Array.isArray(value) ? value.length > 0 : value.available !== false);
  });
  return { included, schema: 'fleet-context-bundle/v1' };
}

function assembleContextBundle({ ticket, paths = [], wikiQuery, alreadyBundled = [] } = {}) {
  const parts = { ticket: ticketContext(ticket), repoMap: repoMap(paths), wiki: wikiContext(wikiQuery) };
  for (const key of alreadyBundled) delete parts[key]; // D15: skip what the caller already sent
  return { ...parts, manifest: buildManifest(parts) };
}

module.exports = { assembleContextBundle, ticketContext, repoMap, wikiContext, buildManifest };
