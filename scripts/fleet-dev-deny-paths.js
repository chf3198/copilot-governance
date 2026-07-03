// tier: 3
// Least-Agency protected-path deny-list (#2798 P1-5 of Epic #2791; design D9 / OWASP-2026 Least Agency).
// High-blast-radius paths (auth, crypto/key-mgmt, IAM/permissions, governance gates + pretool_guard,
// CI/release) are OFF-LIMITS to AUTONOMOUS fleet-development regardless of measured capability — only
// senior-tier (premium) or human may author. This is a HARD pre-filter that runs BEFORE the #2794 capability
// gate and cannot be satisfied by a high score. FAIL-CLOSED: a missing/empty deny-list, an undeclared path
// set, or an unparseable path DENIES (never silently allows). Deny decisions are logged (G8). Pure + injectable.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { isFleetDevEligible } = require('./fleet-dev-eligibility');
const { resolveTelemetryFile } = require('./fleet-telemetry-path');

const DENY_LOG = path.join(process.env.HOME || '', '.megingjord', 'fleet-dev-deny.jsonl');

// Canonicalize for matching so a crafted path cannot evade the deny-list (F1). Steps: bounded URI-decode
// (defeats %63-style encoding incl. multi-encoding), NFKC, then forward-slash + collapse ./.. + lowercase.
// Returns null — which the caller treats as DENIED (fail-closed) — for any path that is empty, malformed-
// encoded, still-encoded after the bound, or NON-ASCII. Non-ASCII is denied wholesale because cross-script
// homoglyphs (Cyrillic 'с' vs Latin 'c') are NOT folded by NFKC; repo paths are ASCII, so a non-ASCII path
// is anomalous → escalate rather than risk a homoglyph bypass.
function normalizePath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  try {
    let decoded = filePath;
    for (let pass = 0; pass < 5 && /%[0-9a-f]{2}/i.test(decoded); pass += 1) decoded = decodeURIComponent(decoded);
    if (/%[0-9a-f]{2}/i.test(decoded)) return null; // still-encoded after the bound → fail-closed
    const canon = decoded.normalize('NFKC').replace(/\\/g, '/'); // unify separators BEFORE the char allow-list
    // ALLOW-LIST of known-safe path chars (alnum + / . _ - @). One rule rejects, fail-closed: non-ASCII
    // homoglyphs, control chars + the null byte (src/auth%00/x truncates to src/auth downstream), AND shell/
    // glob metacharacters (* ? [ ] ~ $ ( ) | ; ` ...) that a downstream glob could expand onto a protected
    // path (src/a*h → src/auth). A repo path outside this set is anomalous → escalate (premium/human).
    if (/[^a-z0-9\/._@-]/i.test(canon)) return null;
    const collapsed = path.posix.normalize(canon.toLowerCase()); // collapse ./ and ../ (F4)
    // Windows ignores trailing dots/spaces on each name → strip them per-segment so 'session./x' can't dodge
    // 'session/'. Done AFTER normalize, preserving '.'/'..' segments so traversal semantics are unchanged.
    const raw = collapsed.split('/');
    const parts = raw.map((seg) => (seg === '.' || seg === '..' ? seg : seg.replace(/[. ]+$/, '')));
    // A segment that was non-empty but strips to empty was ALL dots/spaces — anomalous; fail-closed rather
    // than erase it (erasure would splice neighbours together and could jump a pattern). Already-empty
    // segments (leading/trailing/double slash, raw[idx]==='') are legitimate and kept (so '/auth' stays anchored).
    if (parts.some((seg, idx) => seg === '' && raw[idx] !== '')) return null;
    return parts.join('/');
  } catch { return null; } // malformed encoding (e.g. '%GG') → fail-closed
}

// Own-prop read of the deny patterns; null when absent (→ caller fail-closes). Never reads prototype keys.
function denyPatternsFrom(policy) {
  const owns = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);
  const section = owns(policy, 'fleet_dev_deny_paths') ? policy.fleet_dev_deny_paths : null;
  const patterns = owns(section, 'patterns') ? section.patterns : null;
  return Array.isArray(patterns) ? patterns : null;
}

// Does one path hit any deny pattern? An unparseable path is DENIED (fail-closed).
function matchesDeny(filePath, patterns) {
  const norm = normalizePath(filePath);
  if (norm === null) return { denied: true, pattern: '<unparseable-path>' };
  // Argument-injection guard (path side only — NOT patterns, since '-gate.js' is a legit deny pattern): a
  // segment beginning with '-' (e.g. '-rf', '--force') can be read as a CLI flag by a downstream tool that
  // forgets to '--'-delimit paths → deny. A bare '-' (stdin convention) is harmless and allowed.
  if (norm.split('/').some((seg) => seg.length > 1 && seg.startsWith('-'))) return { denied: true, pattern: '<arg-injection>' };
  for (const pattern of patterns) {
    const needle = normalizePath(pattern);
    if (needle && norm.includes(needle)) return { denied: true, pattern };
  }
  return { denied: false, pattern: null };
}

// Best-effort deny log (G8). Honors MEGINGJORD_NO_TELEMETRY + the traversal-safe redirect (#2885); injectable.
function emitDeny(record, opts = {}) {
  if (opts.emit) { try { opts.emit(record); } catch { /* best-effort */ } return; }
  if (process.env.MEGINGJORD_NO_TELEMETRY) return;
  const file = resolveTelemetryFile(DENY_LOG);
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, JSON.stringify(record) + '\n'); }
  catch { /* best-effort */ }
}

// fleetDevDenyGate(touchedPaths, policy, opts) -> { denied, reason, matches }. The non-bypassable pre-filter.
function fleetDevDenyGate(touchedPaths, policy, opts = {}) {
  const patterns = denyPatternsFrom(policy);
  if (patterns === null || patterns.length === 0) { // misconfig → cannot assert least-agency → deny + log
    const out = { denied: true, reason: 'deny-list-missing-or-empty', matches: [] };
    return (emitDeny({ event: 'fleet-dev-deny', ...out }, opts), out);
  }
  if (!Array.isArray(touchedPaths) || touchedPaths.length === 0) { // can't prove the change avoids them → deny
    const out = { denied: true, reason: 'no-paths-declared', matches: [] };
    return (emitDeny({ event: 'fleet-dev-deny', ...out }, opts), out);
  }
  const matches = [];
  for (const filePath of touchedPaths) {
    const result = matchesDeny(filePath, patterns);
    if (result.denied) matches.push({ path: filePath, pattern: result.pattern });
  }
  const out = { denied: matches.length > 0, reason: matches.length ? 'protected-path' : 'no-protected-path', matches };
  if (out.denied) emitDeny({ event: 'fleet-dev-deny', ...out }, opts);
  return out;
}

// screenFleetDev(args) -> { eligible, decision, rationale, denied, matches? }. THE single fleet-dev screen:
// deny-list FIRST (a match → premium/human only, regardless of capability), else the #2794 capability gate.
function screenFleetDev({ touchedPaths, taskFeatures, profile, policy, opts } = {}) {
  const deny = fleetDevDenyGate(touchedPaths, policy, opts);
  if (deny.denied) {
    return { eligible: false, decision: 'premium-or-human', denied: true, reason: deny.reason,
      matches: deny.matches, rationale: `least-agency-deny: ${deny.reason}` };
  }
  const cap = isFleetDevEligible(taskFeatures, profile, opts);
  return { eligible: cap.eligible, decision: cap.eligible ? 'fleet' : 'escalate', denied: false, rationale: cap.rationale };
}

module.exports = { screenFleetDev, fleetDevDenyGate, matchesDeny, denyPatternsFrom, normalizePath, DENY_LOG };
