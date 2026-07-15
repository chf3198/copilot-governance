'use strict';
// Deterministic linked-ticket resolution for PR / issue bodies. Refs #1614 AC1.
//
// Replaces the first-match /Refs\s+#(\d+)/i pattern, which had two live defects
// (both reproduced in tests/linkage-resolver.spec.js):
//   1. It ignored the GitHub auto-close keyword, so `Closes #A ... Refs #B`
//      resolved to B instead of the authoritative terminal target A.
//   2. It picked the first `Refs #N` even when a research / parent reference
//      preceded the actual ticket reference.
//
// Precedence (first hit wins):
//   1. auto-close keyword: Closes|Fixes|Resolves #N   (the explicit terminal target)
//   2. merge-evidence-deferred-final: #N              (Option-C deferred close, #2303)
//   3. first line-anchored `Refs #N`                  (conventional ticket-first ordering)
//
// `Refs Epic #N` is structurally excluded: the `Refs\s+#` anchor cannot match
// `Refs Epic #N` because the word "Epic" sits between "Refs " and "#". The
// regression suite asserts this so the exclusion can never silently regress.
//
// Matching is line-anchored (start-of-line, after optional list markers) so a
// keyword appearing mid-prose ("we should fix #5 later") is NOT treated as a
// linkage directive. Pure, side-effect-free, no IO — safe to require() from an
// `actions/github-script` step via an absolute GITHUB_WORKSPACE path.

// Issue numbers are bounded to 1-9 digits: GitHub issue numbers are far below
// 1e9, and an unbounded `\d+` lets a pathological 400-digit run overflow
// Number() to Infinity (caught by tests/stress-linkage-resolver.spec.js).
const CLOSE_RE = /(?:^|\n)[ \t*-]*(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d{1,9})\b/i;
const DEFERRED_FINAL_RE = /(?:^|\n)[ \t*-]*merge-evidence-deferred-final:\s*#(\d{1,9})\b/i;
const REFS_RE = /(?:^|\n)[ \t*-]*Refs\s+#(\d{1,9})\b/i;

// Resolve the single authoritative ticket a PR/issue body links to.
// Returns { ticket: number|null, source: 'close-keyword'|'deferred-final'|'refs'|'none' }.
function resolveLinkedTicket(body) {
  const text = String(body == null ? '' : body);
  const close = CLOSE_RE.exec(text);
  if (close) return { ticket: Number(close[1]), source: 'close-keyword' };
  const deferred = DEFERRED_FINAL_RE.exec(text);
  if (deferred) return { ticket: Number(deferred[1]), source: 'deferred-final' };
  const refs = REFS_RE.exec(text);
  if (refs) return { ticket: Number(refs[1]), source: 'refs' };
  return { ticket: null, source: 'none' };
}

module.exports = { resolveLinkedTicket, CLOSE_RE, DEFERRED_FINAL_RE, REFS_RE };
