// Renders an assembled fleet context bundle (#2802 slice 2; design D12/D15) into a token-bounded
// text preamble — "the most information possible" within a budget. Pairs with assembleContextBundle
// (slice 1). Truncation priority: ticket > repo-map > wiki (drop lowest-priority first). Pure (no IO).
const DEFAULT_MAX_CHARS = 4000;

function resolveMaxChars(opts = {}) {
  if (opts.maxChars === undefined || opts.maxChars === null) return DEFAULT_MAX_CHARS;
  if (!Number.isInteger(opts.maxChars) || opts.maxChars <= 0) {
    throw new TypeError('maxChars must be a positive integer');
  }
  return opts.maxChars;
}

function renderTicket(ticket) {
  if (!ticket || ticket.available === false) return '';
  const recent = (ticket.comments || []).slice(-3).join('\n---\n');
  return `=== TICKET #${ticket.number}: ${ticket.title || ''} ===\n${(ticket.body || '').trim()}`
    + (recent ? `\n--- recent comments ---\n${recent}` : '');
}

function renderRepoMap(repoMap) {
  return (repoMap || [])
    .filter((entry) => entry.available !== false && (entry.symbols || []).length)
    .map((entry) => `# ${entry.path}\n${entry.symbols.join('\n')}`).join('\n\n');
}

function renderWiki(wiki) {
  return (wiki || []).length ? `=== WIKI ===\n${wiki.join('\n')}` : '';
}

const CLIP_MARKER = '\n…[clipped]';
const SEP = '\n\n'; // separator joining rendered sections

function clip(text, max) {
  if (text.length <= max) return text;
  // #2819: when the budget can't fit the marker, hard-truncate (never exceed max).
  if (max <= CLIP_MARKER.length) return text.slice(0, Math.max(0, max));
  return text.slice(0, max - CLIP_MARKER.length) + CLIP_MARKER;
}

// renderContextPreamble(bundle, {maxChars}) -> { preamble, included, truncated }.
// Fills sections in priority order up to maxChars; flags truncation; never throws on a sparse bundle.
function renderContextPreamble(bundle = {}, opts = {}) {
  const maxChars = resolveMaxChars(opts);
  const sections = [
    ['ticket', renderTicket(bundle.ticket)],
    ['repoMap', renderRepoMap(bundle.repoMap)],
    ['wiki', renderWiki(bundle.wiki)],
  ].filter(([, text]) => text);
  const parts = [];
  let used = 0;
  let truncated = false;
  for (const [, text] of sections) {
    const sep = parts.length ? SEP.length : 0; // join '\n\n' to a PRECEDING part only (no over-count)
    const remaining = maxChars - used - sep;
    if (remaining <= 0) { truncated = true; break; }
    const piece = clip(text, remaining);
    if (piece.length < text.length) truncated = true;
    parts.push(piece);
    used += sep + piece.length;
  }
  return { preamble: parts.join(SEP), included: sections.slice(0, parts.length).map(([name]) => name), truncated };
}

module.exports = { renderContextPreamble, renderTicket, renderRepoMap, renderWiki, DEFAULT_MAX_CHARS };
