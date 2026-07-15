// Fleet sandbox runner (#2844 P1-0 child of #2802; design D13). The ISOLATION substrate for
// validating a fleet model's proposed change: a throwaway DETACHED git worktree off HEAD, into which
// the proposed files are written and the operator-declared test command runs — the real working tree
// is never touched. Security: the fleet payload is DATA (files written to the sandbox); only the
// operator's own `testCommand` array is executed via execFile (no shell), so a malicious payload
// cannot inject a command (OWASP OA10 Code Execution / OA2 Tool Misuse). Every side-effect (git,
// exec, fs) is injectable so unit + stress tests stay process- and network-free. Pairs with the
// fail-closed orchestrator in fleet-sandbox-exec.js.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_OUTPUT_BYTES = 1048576; // clamp captured stdout/stderr — OOM guard for chatty suites (G6)
const CLIP = '\n…[clipped]';

// Clamp captured output to a byte budget so a runaway test log cannot exhaust memory (G6).
function clampOutput(text) {
  const str = String(text == null ? '' : text);
  return str.length > MAX_OUTPUT_BYTES ? str.slice(0, MAX_OUTPUT_BYTES) + CLIP : str;
}

// Write the (path-string-validated) changes into the sandbox, defending against SYMLINK ESCAPE: a
// pre-existing symlink in the checked-out HEAD — a leaf OR a parent dir component — could otherwise
// make writeFileSync follow it OUT of the sandbox (#2844 gemini review HIGH). Defense: (a) reject any
// change whose real parent dir resolves outside the worktree; (b) unlink any existing leaf before
// writing so we never follow a leaf symlink. Throws on escape → caller fails closed.
function applyChanges(safe, sandboxDir, fsImpl = fs) {
  const realRoot = fsImpl.realpathSync(sandboxDir);
  for (const change of safe) {
    const dest = path.join(realRoot, change.path);
    fsImpl.mkdirSync(path.dirname(dest), { recursive: true });
    const realParent = fsImpl.realpathSync(path.dirname(dest));
    if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
      throw new Error(`sandbox escape via symlinked path: ${change.path}`);
    }
    try { fsImpl.rmSync(dest, { force: true }); } catch { /* no existing leaf to drop */ }
    fsImpl.writeFileSync(dest, change.content);
  }
}

// Default sandbox: create a temp dir, add a detached git worktree off HEAD inside it, apply the
// change, run testCommand there (bounded + captured), then tear everything down (best-effort). `cmd`
// is injectable (tests pass a fake → no git, no spawn). Returns a raw run shape consumed by classify:
//   { exitCode, timedOut, stdout, stderr } | { error }.
function defaultRunner({ safe, testCommand, root, timeoutMs }, cmd = execFileSync) {
  let sandboxDir; // declared before the try so teardown can run iff the temp dir was created
  const opts = { encoding: 'utf8', timeout: timeoutMs };
  try {
    sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-sbx-'));
    fs.chmodSync(sandboxDir, 0o700); // deny other host users → narrows the realpath-check TOCTOU window
    const worktree = path.join(sandboxDir, 'wt');
    cmd('git', ['-C', root, 'worktree', 'add', '--detach', worktree, 'HEAD'], opts);
    applyChanges(safe, worktree);
    try {
      const stdout = cmd(testCommand[0], testCommand.slice(1), { ...opts, cwd: worktree });
      return { exitCode: 0, stdout: clampOutput(stdout), stderr: '' };
    } catch (runErr) {
      return {
        exitCode: typeof runErr.status === 'number' ? runErr.status : 1,
        timedOut: Boolean(runErr.killed) || runErr.signal === 'SIGTERM',
        stdout: clampOutput(runErr.stdout),
        stderr: clampOutput(runErr.stderr),
      };
    }
  } catch (setupErr) {
    return { error: setupErr.message };
  } finally {
    if (sandboxDir) teardown(root, path.join(sandboxDir, 'wt'), sandboxDir, cmd, opts);
  }
}

// Best-effort isolation teardown: detach the worktree from git, then remove the temp dir. Failures
// here never change the verdict — the sandbox is throwaway by construction.
function teardown(root, worktree, sandboxDir, cmd, opts) {
  try { cmd('git', ['-C', root, 'worktree', 'remove', '--force', worktree], opts); }
  catch { /* best-effort: a missing/locked worktree is harmless (sandbox is throwaway) */ }
  try { fs.rmSync(sandboxDir, { recursive: true, force: true }); }
  catch { /* best-effort: temp dir cleanup is non-critical */ }
}

module.exports = { defaultRunner, applyChanges, clampOutput, teardown, MAX_OUTPUT_BYTES };
