// IDE/native-MCP coexistence resolver for the fleet MCP loop (#2855 P1-0 child of #2802; design D12,
// Copilot constraint). Picks a FREE port for the fleet loop while AVOIDING ports a host IDE's MCP servers
// declare (read from committed/saved disk config) — so the fleet loop never collides with e.g.
// github.copilot.mcp.servers. Binding the chosen port holds the OS-level mutual-exclusion lock, so two
// fleet loops can never double-bind. If no free port is available it degrades to disk-read-only mode
// (graceful, G6); absent any IDE/MCP config it is a no-op pass-through to a free port (tier-graceful, G5).
// Pure decision logic — binder + config reader injectable so tests run with no real socket or disk.
const { defaultBinder, readHostConfig } = require('./fleet-mcp-portbind');

const DEFAULT_CANDIDATES = [8900, 8901, 8902, 8903, 8904]; // fleet-loop port pool (distinct from dashboard:8090)
const PORT_IN_URL = /:(\d{2,5})(?:\/|$)/;

// Ports one server entry declares: an explicit `port`, or a port embedded in a `url` (bounded {2,5} →
// no ReDoS). Returns [] for any other shape.
function portsFromEntry(entry) {
  const ports = [];
  if (entry && Number.isInteger(entry.port)) ports.push(entry.port);
  const matched = entry && typeof entry.url === 'string' && entry.url.match(PORT_IN_URL);
  if (matched) ports.push(Number(matched[1]));
  return ports;
}

// Ports a host IDE's MCP servers declare (to AVOID). Tolerant of the two common config shapes
// (`servers` / `mcpServers`); reader injectable; a missing/malformed config yields [] (tier-graceful).
function detectHostMcpPorts(opts = {}) {
  const reader = opts.readConfig || readHostConfig;
  const config = reader(opts.hostConfigPath);
  if (!config || typeof config !== 'object') return [];
  const servers = config.servers || config.mcpServers || {};
  if (!servers || typeof servers !== 'object') return [];
  return Object.keys(servers).flatMap((key) => portsFromEntry(servers[key]));
}

// Bind the FIRST candidate port not in `avoid`; the held bind is the coexistence lock. Returns
// { port, handle } (handle.release closes it) or null when every candidate is busy/avoided. Sequential
// on purpose — we want the first free port, not to bind them all.
async function pickBoundPort(candidates, avoid, binder) {
  for (const port of candidates) {
    if (avoid.includes(port)) continue;
    const handle = await binder(port);
    if (handle) return { port, handle };
  }
  return null;
}

// resolveCoexistence(opts) -> { mode:'port', port, release, avoided } | { mode:'disk-read-only', reason, avoided }.
//   opts.preferredPort · opts.candidates · opts.hostConfigPath · opts.binder / opts.readConfig (injectable).
async function resolveCoexistence(opts = {}) {
  const avoid = detectHostMcpPorts(opts);
  const binder = opts.binder || defaultBinder;
  const candidates = [opts.preferredPort, ...(opts.candidates || DEFAULT_CANDIDATES)].filter(Number.isInteger);
  const bound = await pickBoundPort(candidates, avoid, binder);
  if (!bound) {
    return { mode: 'disk-read-only', avoided: avoid,
      reason: 'no free MCP port (host-IDE coexistence) — degraded to disk-read-only' };
  }
  return { mode: 'port', port: bound.port, release: bound.handle.release, avoided: avoid };
}

module.exports = { resolveCoexistence, detectHostMcpPorts, pickBoundPort, DEFAULT_CANDIDATES };
