// Fleet sandbox test-exec orchestrator (#2844 P1-0 child of #2802; design D13). Closes the trust gap
// in the fleet dogfood loop: a fleet model returns a PROPOSED change, and this validates it by running
// the operator's tests in an isolated sandbox (fleet-sandbox-runner.js) before the change is trusted.
// Fail-closed (G1): unsafe paths, a runner error, a timeout, or a non-zero test exit ⇒ trusted:false,
// each with an operator-visible reason (G8). The runner is injectable so tests stay network-free.
const path = require('path');
const { defaultRunner } = require('./fleet-sandbox-runner');

const DEFAULT_TIMEOUT_MS = 120000; // bounded test run; a runaway suite is killed → untrusted (G6)
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // cap total proposed content — disk-exhaustion DoS guard (G6)

// Total byte size of proposed content — rejects an oversize payload before disk write (an untrusted
// model could otherwise fill the volume; #2844 gemini review MED).
function payloadBytes(safe) {
  return safe.reduce((sum, change) => sum + Buffer.byteLength(change.content), 0);
}

// A change path is SAFE only if non-empty, repo-relative, and resolving inside `root`. The byte-exact
// prefix guard mirrors fleet-context-bundle.js#repoMap (#2819): blocks absolute paths + '..' escapes.
function isSafeChangePath(rel, resolvedRoot) {
  if (!rel || path.isAbsolute(rel)) return false;
  const full = path.resolve(resolvedRoot, rel);
  return full === resolvedRoot || full.startsWith(resolvedRoot + path.sep);
}

// Partition proposed changes into safe vs. rejected using isSafeChangePath. Safe changes have their
// content coerced to a string (null/undefined → ''); rejected paths are recorded for the verdict.
function partitionChanges(changes, root) {
  const resolvedRoot = path.resolve(root);
  const safe = [];
  const rejected = [];
  for (const change of changes || []) {
    const rel = change && change.path;
    if (isSafeChangePath(rel, resolvedRoot)) {
      safe.push({ path: rel, content: String(change.content == null ? '' : change.content) });
    } else {
      rejected.push(rel || '(empty)');
    }
  }
  return { safe, rejected };
}

// Map a raw run (or a pre-run rejection) to a trust verdict. Fail-closed: only a clean zero-exit with
// no timeout, no error, and no rejected paths earns trusted:true. `reason` is always populated (G8).
function classifyVerdict({ exitCode, timedOut, rejected, error } = {}) {
  if (rejected && rejected.length) {
    return { trusted: false, reason: `unsafe change paths rejected: ${rejected.join(', ')}` };
  }
  if (error) return { trusted: false, reason: `sandbox error: ${error}` };
  if (timedOut) return { trusted: false, reason: 'test command timed out' };
  if (exitCode !== 0) return { trusted: false, reason: `tests failed (exit ${exitCode})` };
  return { trusted: true, reason: 'tests passed in sandbox' };
}

// The test command MUST be an operator-declared [cmd, ...args] array — executed via execFile (no
// shell), so a fleet payload can never inject a command through it (OA10/OA2). Throws on a bad shape.
function assertTestCommand(testCommand) {
  if (!Array.isArray(testCommand) || !testCommand.length || typeof testCommand[0] !== 'string') {
    throw new Error('validateProposedChange: testCommand must be a non-empty [cmd, ...args] array');
  }
}

// Pre-run guards that block BEFORE any sandbox is created (nothing written): unsafe paths, then an
// oversize payload. Returns a fail-closed verdict to short-circuit on, or null when the batch is clean.
function prerunBlock(safe, rejected) {
  if (rejected.length) {
    return { ...classifyVerdict({ rejected }), rejected, exitCode: null, stdout: '', stderr: '' };
  }
  if (payloadBytes(safe) > MAX_PAYLOAD_BYTES) {
    return { trusted: false, reason: 'proposed change payload exceeds 10MB (disk-exhaustion guard)',
      rejected: [], exitCode: null, stdout: '', stderr: '' };
  }
  return null;
}

// validateProposedChange(opts) -> { trusted, reason, exitCode, stdout, stderr, rejected }. opts.changes
// = untrusted [{path,content}]; opts.testCommand = operator [cmd,...args]; opts.runner injectable.
function validateProposedChange(opts = {}) {
  const { changes, testCommand, root = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  assertTestCommand(testCommand);
  const { safe, rejected } = partitionChanges(changes, root);
  const blocked = prerunBlock(safe, rejected);
  if (blocked) return blocked;
  const runner = opts.runner || defaultRunner;
  let raw;
  try { raw = runner({ safe, testCommand, root, timeoutMs }); }
  catch (runnerErr) { raw = { error: runnerErr.message }; }
  return {
    ...classifyVerdict({ ...raw, rejected: [] }),
    rejected: [],
    exitCode: raw.exitCode == null ? null : raw.exitCode,
    stdout: raw.stdout || '',
    stderr: raw.stderr || '',
  };
}

module.exports = {
  validateProposedChange, partitionChanges, classifyVerdict, assertTestCommand,
  payloadBytes, DEFAULT_TIMEOUT_MS, MAX_PAYLOAD_BYTES,
};
