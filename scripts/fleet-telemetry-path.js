// Resolve a fleet-dev telemetry file path with an optional, TRAVERSAL-SAFE MEGINGJORD_TELEMETRY_DIR
// redirect (#2885). The redirect lets tests/operators send telemetry to a chosen dir; a value containing
// any '..' path segment is rejected (defense-in-depth — never let an env-supplied path escape via traversal)
// and the caller's default path is used instead. The basename of the default is always preserved, so the
// redirect controls only the directory, never the filename. Pure: no fs, no env mutation — caller owns both.
const path = require('path');

// Return the redirect dir only when it is a non-empty path with NO '..' segment; otherwise null. Splitting
// on both separators rejects a true traversal segment ('/a/../b') while allowing a dir merely NAMED with
// dots ('/tmp/foo..bar' is fine — 'foo..bar' is not the '..' segment).
function safeRedirectDir(raw) {
  if (!raw || raw.split(/[\\/]/).includes('..')) return null;
  return raw;
}

// Compose the final file: <safe-redirect-dir>/<basename(defaultFile)> when a safe redirect is set, else the
// default path unchanged. Default arg reads the env so callers stay a one-liner; pass `raw` to unit-test.
function resolveTelemetryFile(defaultFile, raw = process.env.MEGINGJORD_TELEMETRY_DIR) {
  const dir = safeRedirectDir(raw);
  return dir ? path.join(dir, path.basename(defaultFile)) : defaultFile;
}

module.exports = { safeRedirectDir, resolveTelemetryFile };
