// tier: 3
// Default gates + telemetry for the fleet-dev execution path (#2795 P1-2; design D8-gate). The FUNCTIONAL
// gate runs real local checks (lint + tests); the SECURITY gate runs a real local secret-exposure scan of
// the fleet output (the highest-value check on untrusted LLM output) — full dependency-review + SAST are
// CI-side and injected via opts for complete coverage. Each gate returns { pass, detail }. FAIL-CLOSED: an
// exec error or a detected secret is a FAIL. Command exec is injectable (opts.exec) so the orchestration
// is testable process-free. Telemetry append is best-effort + secret-safe (records metadata, never output).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolveTelemetryFile } = require('./fleet-telemetry-path');

const TELEMETRY = path.join(process.env.HOME || '', '.megingjord', 'fleet-dev-telemetry.jsonl');
const CHECK_TIMEOUT_MS = 180000;
const MAX_SCAN_BYTES = 1024 * 1024; // bound the untrusted output scanned — oversize fails closed (G6)
// High-confidence secret shapes — a match in fleet output is an immediate security FAIL (secret exposure).
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}\b/, /\bghp_[A-Za-z0-9]{36}\b/, /\bgho_[A-Za-z0-9]{36}\b/,
  /\bAKIA[0-9A-Z]{16}\b/, /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];

// Run [name, cmd, args] checks; pass only if ALL exit 0. First failure names itself; an exec error is a
// FAIL (fail-closed). `exec` injectable.
function runChecks(checks, exec = execFileSync) {
  for (const [name, cmd, args] of checks) {
    try { exec(cmd, args, { encoding: 'utf8', timeout: CHECK_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (err) { return { pass: false, detail: `${name}-failed (exit ${err && err.status})` }; }
  }
  return { pass: true, detail: 'all-checks-passed' };
}

function defaultFunctionalGate(result, opts = {}) {
  return runChecks([['lint', 'node', ['scripts/lint.js']], ['tests', 'npm', ['test']]], opts && opts.exec);
}

// Real local secret-exposure scan of the fleet output. Never logs the matched value (G4). Returns FAIL on
// any secret pattern; passes otherwise (inject dep-review/SAST via opts.securityGate for full coverage).
function defaultSecurityGate(result) {
  let text;
  try { text = JSON.stringify(result == null ? '' : result); } catch { return { pass: false, detail: 'unserializable-output' }; }
  // oversize untrusted output can't be safely/fully scanned → fail-closed (don't accept, don't OOM on regex).
  if (text.length > MAX_SCAN_BYTES) return { pass: false, detail: 'output-too-large-to-scan' };
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) return { pass: false, detail: 'secret-exposure-detected' };
  }
  return { pass: true, detail: 'no-secret-pattern (inject dep-review/SAST for full coverage)' };
}

// Append one telemetry record as a JSONL line; best-effort, never throws (G6/G8).
function defaultEmit(record) {
  if (process.env.MEGINGJORD_NO_TELEMETRY) return; // test/CI opt-out — never write prod telemetry
  const file = resolveTelemetryFile(TELEMETRY); // traversal-safe MEGINGJORD_TELEMETRY_DIR redirect
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(record) + '\n');
  } catch { /* telemetry is best-effort */ }
}

module.exports = { defaultFunctionalGate, defaultSecurityGate, defaultEmit, runChecks, SECRET_PATTERNS, TELEMETRY };
