// Default side-effecting deps for fleet MCP coexistence (#2855 P1-0 child of #2802; design D12).
// `defaultBinder` claims a TCP port by binding a server and KEEPING it open — the held socket is the
// OS-level coexistence lock (a second loop's bind of the same port fails with EADDRINUSE). `readHostConfig`
// reads a committed IDE MCP config from disk. Both are injectable in fleet-mcp-coexist.js so unit + stress
// tests run with no real socket or disk. Graceful: a bind failure → null (port busy); a bad config → null.
const net = require('node:net');
const fs = require('node:fs');

const LOOPBACK = '127.0.0.1'; // bind fleet MCP ports to loopback only — never externally exposed (G4)

// Claim `port` on loopback (127.0.0.1 — local-only, never externally exposed, G4). Resolves to
// { release } holding the socket, or null if the port is in use / unbindable. Never rejects.
function defaultBinder(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    // EADDRINUSE / EACCES → unavailable. close() the server so its FD is released immediately, not at GC
    // (avoids slow FD exhaustion under repeated bind failures). close() on a non-listening server is safe.
    server.once('error', () => { try { server.close(); } catch { /* not listening */ } resolve(null); });
    server.listen(port, LOOPBACK, () => resolve({ release: () => { try { server.close(); } catch { /* already closed */ } } }));
  });
}

// Read + parse a committed IDE MCP config (the host's saved disk state). Missing path / unreadable /
// malformed JSON all degrade to null (the resolver then avoids nothing — tier-graceful, G5/G6).
function readHostConfig(configPath) {
  if (!configPath) return null;
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch { return null; }
}

module.exports = { defaultBinder, readHostConfig };
