'use strict';
// inbound-reference-integrity (#3419, Epic #3398 C1) — pure logic for the
// issues.closed INBOUND sibling of epic-close-readiness-check.js (outbound-only).
// Detects dangling pointers TO a closing ticket #N in other live OPEN issues
// (PB2 inbound-orphan) and folds in $0 PB4 dependency-rot (blocked-by #N cleared
// on close). Deterministic, no model calls (semantic lane is #3420). Research §3:
// existence-dependency KG edge; reference-rot is a measured ~23% class.

// Reference-form catalog. Each builds a per-#N matcher; `cls` tags PB2 vs PB4.
const FORMS = [
  { id: 'merge-into', cls: 'PB2', re: (n) => new RegExp(`(?:merge[d]?|fold(?:ed)?)\\s+into\\s+#${n}\\b`, 'i'), why: 'designated merge survivor' },
  { id: 'blocked-by', cls: 'PB4', re: (n) => new RegExp(`block(?:ed|s)?\\s+(?:by\\s+)?#${n}\\b`, 'i'), why: 'dependency edge cleared on close' },
  { id: 'survivor', cls: 'PB2', re: (n) => new RegExp(`(?:survivor|canonical|supersed\\w+)[:\\s]+#${n}\\b`, 'i'), why: 'survivor/canonical designation' },
  { id: 'parent-ref', cls: 'PB2', re: (n) => new RegExp(`(?:Refs\\s+Epic|Parent)\\s*:?\\s*#${n}\\b`, 'i'), why: 'structural parentage' },
];

// Evidence line cap kept short so a correction task stays scannable.
const MAX_LINE_CHARS = 200;

/**
 * Return the first line of `text` matching `re`, trimmed and capped, else null.
 * @param {string} text - issue body/title blob to scan.
 * @param {RegExp} re - per-#N reference matcher.
 * @returns {string|null} the matching evidence line, or null when none matches.
 */
function firstMatchingLine(text, re) {
  for (const line of String(text || '').split('\n')) if (re.test(line)) return line.trim().slice(0, MAX_LINE_CHARS);
  return null;
}

/**
 * Scan open issues for dangling inbound pointers TO the closing ticket.
 * @param {number} closing - the ticket being closed/cancelled.
 * @param {Array<{number:number,text:string}>} items - live OPEN issues (excluding #closing).
 * @returns {Array<{from:number,form:string,cls:string,why:string,line:string}>} orphan findings.
 */
function scanInbound(closing, items) {
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it.number !== 'number' || it.number === closing) continue;
    for (const form of FORMS) {
      const line = firstMatchingLine(it.text, form.re(closing));
      if (line) out.push({ from: it.number, form: form.id, cls: form.cls, why: form.why, line });
    }
  }
  return out;
}

/**
 * De-duplicated source issue numbers from a list of orphan findings.
 * @param {Array<{from:number}>} orphans - findings from scanInbound.
 * @returns {number[]} unique `from` issue numbers.
 */
function uniqueFroms(orphans) {
  return [...new Set(orphans.map((o) => o.from))];
}

/**
 * Build the Manager-triage re-home correction task for the dangling pointers.
 * @param {number} closing - the closed ticket the pointers referenced.
 * @param {Array<object>} orphans - findings from scanInbound.
 * @returns {{title:string,labels:string[],body:string}} issue-create payload.
 */
function buildCorrectionTask(closing, orphans) {
  const froms = uniqueFroms(orphans);
  const lines = orphans.map((o) => `- #${o.from} (${o.form}/${o.cls}): \`${o.line}\``).join('\n');
  return {
    title: `Re-home orphaned reference to #${closing} from ${froms.map((n) => `#${n}`).join(', ')}`,
    labels: ['type:task', 'type:correction', 'status:backlog', 'area:governance', 'anneal:tier-2'],
    body: `Auto-filed by inbound-reference-integrity (#3419). Ticket #${closing} closed/cancelled while these live items point at it — re-home or re-triage each dangling pointer:\n\n${lines}\n\nParent: #3398\nRefs #${closing}`,
  };
}

/**
 * Build the schema-v3 incidents.jsonl record for an inbound-orphan event.
 * @param {number} closing - the closed ticket.
 * @param {Array<object>} orphans - findings from scanInbound.
 * @param {string} ts - ISO-8601 timestamp.
 * @param {string} [env] - event environment (ci|local|test|cloudflare).
 * @returns {object} schema-v3 incident record (pattern_id: inbound-reference-orphan).
 */
function buildIncident(closing, orphans, ts, env = 'ci') {
  const froms = uniqueFroms(orphans);
  return {
    ts, timestamp: ts, version: 3, service: 'inbound-reference-integrity', env,
    event: 'drift-detected', severity: 'medium', trigger_role: 'system',
    pattern_id: 'inbound-reference-orphan', closing, orphan_count: orphans.length,
    from: froms,
    _summary: `#${closing} closed with ${orphans.length} dangling inbound pointer(s) from ${froms.map((n) => `#${n}`).join(',')}`,
  };
}

module.exports = { FORMS, firstMatchingLine, scanInbound, uniqueFroms, buildCorrectionTask, buildIncident };
