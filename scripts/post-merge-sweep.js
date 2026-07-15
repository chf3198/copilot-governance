'use strict';
// post-merge-sweep (#1911, Epic #1894) — force-close ticket drifters left OPEN
// when GitHub auto-close-via-PR-keyword misfires (selective-miss or commit-vs-body).
// Pure-ish: the GitHub client, clock, and audit emit are INJECTED so tests never
// touch real issues/network and never sleep wall-clock. Matches GitHub's full
// close-keyword set (superset of AC2 Closes/Fixes/Resolves).

const path = require('node:path');
const os = require('node:os');

// `:?` accepts GitHub's optional-colon form ("Closes: #5"); `\s+` (not \s*) is
// kept so "closes#5" — which GitHub does NOT auto-close — never matches (mass-close guard).
const KEYWORD_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)/gi;
const DEFERRED_FINAL_RE = /\bmerge-evidence-deferred-final:\s*#(\d+)/gi;
const CLOSEOUT_HEADER_RE = /(^|\n)\s*(?:\*\*|##\s+)?CONSULTANT_CLOSEOUT(?:_EPIC_CLOSEOUT)?\b/;
const COMMENT_MARKER = '<!-- post-merge-sweep -->';
const DEFAULT_AUDIT = path.join(os.homedir(), '.megingjord', 'post-merge-sweep.jsonl');
const POLL = { attempts: 6, intervalMs: 5000 }; // ~30s budget (AC3)

function parseCloseKeywords(text) {
  const out = [];
  if (!text) return out;
  for (const m of String(text).matchAll(KEYWORD_RE)) out.push(Number(m[1]));
  return out;
}

function parseDeferredFinal(text) {
  const out = [];
  if (!text) return out;
  for (const m of String(text).matchAll(DEFERRED_FINAL_RE)) out.push(Number(m[1]));
  return out;
}

// AC2: de-duplicated union of citations from PR body AND every commit message.
function collectCitations({ prBody = '', commitMessages = [] } = {}) {
  const nums = new Set(parseCloseKeywords(prBody));
  for (const msg of commitMessages) for (const num of parseCloseKeywords(msg)) nums.add(num);
  return [...nums];
}

function collectSweepTargets({ prBody = '', commitMessages = [] } = {}) {
  const keyword = collectCitations({ prBody, commitMessages });
  const deferred = [...new Set(parseDeferredFinal(prBody))];
  return { citations: [...new Set([...keyword, ...deferred])], deferredOnly: new Set(deferred) };
}

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildComment(prNumber) {
  return `${COMMENT_MARKER}\nAuto-closed by post-merge-sweep — PR #${prNumber} cited a close-keyword `
    + 'for this issue but GitHub auto-close did not fire. Closing to prevent terminal-but-open '
    + 'drift. (Refs #1911.)';
}

// AC3/AC4: poll state up to POLL.attempts; force-close survivors (idempotent).
// state read error => skip (never close on uncertainty) — OA2 mass-close guard.
async function settleOne(github, owner, repo, number, opts = {}) {
  if (opts.requiresCloseout) {
    const comments = await github.issues.listComments({ owner, repo, issue_number: number, per_page: 100 });
    const hasCloseout = (comments.data || []).some((c) => CLOSEOUT_HEADER_RE.test((c && c.body) || ''));
    if (!hasCloseout) return { number, action: 'deferred-no-closeout', prNumber: opts.prNumber };
  }
  const poll = opts.poll || POLL;
  const nap = opts.sleep || realSleep;
  for (let i = 0; i < poll.attempts; i++) {
    let state;
    try { ({ data: { state } } = await github.issues.get({ owner, repo, issue_number: number })); }
    catch (e) { return { number, action: 'skipped-errored', error: String(e && e.message || e) }; }
    if (state === 'closed') return { number, action: i === 0 ? 'already-closed' : 'closed-after-poll' };
    if (i < poll.attempts - 1) await nap(poll.intervalMs);
  }
  if (opts.advisoryClose) return { number, action: 'would-force-close', prNumber: opts.prNumber };
  await github.issues.update({ owner, repo, issue_number: number, state: 'closed', state_reason: 'completed' });
  await github.issues.createComment({ owner, repo, issue_number: number, body: buildComment(opts.prNumber) });
  return { number, action: 'force-closed', prNumber: opts.prNumber };
}

async function sweep({ github, owner, repo, prNumber, prBody, commitMessages, ...opts }) {
  const targets = collectSweepTargets({ prBody, commitMessages });
  const citations = targets.citations;
  const records = [];
  for (const number of citations) {
    records.push(await settleOne(github, owner, repo, number, {
      ...opts,
      prNumber,
      requiresCloseout: targets.deferredOnly.has(number),
    }));
  }
  return { prNumber, citations, records };
}

// AC5: one audit record per drift (force-closed | would-force-close | skipped-errored).
function toAuditEvents(result, schema = require('./event-schema-v3.js')) {
  const drift = new Set(['force-closed', 'would-force-close', 'skipped-errored', 'deferred-no-closeout']);
  return result.records.filter((r) => drift.has(r.action)).map((r) => schema.normalize({
    version: 'v3', service: 'post-merge-sweep', env: 'ci', event: 'drift-remediated',
    pr: result.prNumber, issue: r.number, action: r.action, error: r.error,
    _summary: `#${r.number} ${r.action} (PR #${result.prNumber})`,
  }));
}

function appendAudit(result, opts = {}) {
  const schema = opts.schema || require('./event-schema-v3.js');
  const file = opts.auditFile || DEFAULT_AUDIT;
  const emit = opts.emit || schema.emitV3;
  const events = toAuditEvents(result, schema);
  for (const ev of events) emit(ev, file);
  return events.length;
}

module.exports = {
  parseCloseKeywords, collectCitations, buildComment, settleOne, sweep,
  parseDeferredFinal, collectSweepTargets,
  toAuditEvents, appendAudit, KEYWORD_RE, DEFERRED_FINAL_RE, CLOSEOUT_HEADER_RE,
  COMMENT_MARKER, POLL, DEFAULT_AUDIT,
};
