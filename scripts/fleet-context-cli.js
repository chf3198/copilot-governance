// Fleet context CLI (#2831 P1-0 child of #2802; design D12/D15). Closes the dogfood loop: assemble
// ticket+repo-map+wiki context (slice 1), render the preamble (slice 2), prepend to a task and
// dispatch (slice 3) via the existing zero-cost cascade (free-cloud-dispatch). No new provider
// surface — reuses the cost-ascending lanes (G3). Pure helpers are exported + unit-tested network-free.
const { dispatchWithContext } = require('./fleet-context-dispatch');
const { dispatchFreeCloud } = require('./free-cloud-dispatch');

// Parse `--flag value` / `--flag=value` argv into an options object. Non-flag tokens are ignored.
// A flag immediately followed by another `--flag` (or end of argv) is valueless → '' (does NOT
// swallow the next flag as its value).
function parseArgs(argv = []) {
  const opts = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token !== 'string' || !token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq !== -1) { opts[token.slice(2, eq)] = token.slice(eq + 1); continue; }
    const next = argv[index + 1];
    const valueless = next === undefined || (typeof next === 'string' && next.startsWith('--'));
    opts[token.slice(2)] = valueless ? '' : (index += 1, next);
  }
  return opts;
}

// Parse a required-numeric CLI value; fail fast (G8) on empty/whitespace/non-numeric input rather
// than passing NaN — or a misleading Number('')===0 — downstream.
function numericOpt(name, raw) {
  const parsed = Number(raw);
  if (String(raw).trim() === '' || !Number.isFinite(parsed)) {
    throw new Error(`--${name} must be a number, got '${raw}'`);
  }
  return parsed;
}

// Map raw CLI options to dispatchWithContext input (numbers validated, paths split on comma).
function toContextOpts(cli = {}) {
  const out = { task: cli.task || '' };
  if (cli.ticket) out.ticket = numericOpt('ticket', cli.ticket);
  if (cli.paths) out.paths = cli.paths.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (cli.wiki) out.wikiQuery = cli.wiki;
  if (cli['max-context-chars']) out.maxContextChars = numericOpt('max-context-chars', cli['max-context-chars']);
  return out;
}

// Real zero-cost dispatch (G3): free-cloud cascade. Returns {content, provider}; throws with the
// cascade's reason on failure (G6 surfaces why, never a silent empty). `impl` injectable for tests.
async function freeCloudDispatch(prompt, impl = dispatchFreeCloud) {
  const result = await impl(prompt);
  if (!result.ok) {
    const tried = result.tried ? ` (${result.tried.join(', ')})` : '';
    throw new Error(`free-cloud dispatch failed: ${result.reason}${tried}`);
  }
  return { content: result.content, provider: result.provider };
}

// runCli(argv, deps) -> { result, manifest, included, truncated }. deps.dispatch injectable (tests
// supply a fake to stay network-free); defaults to the real free-cloud cascade.
async function runCli(argv = [], deps = {}) {
  const cli = parseArgs(argv);
  const dispatch = deps.dispatch || ((prompt) => freeCloudDispatch(prompt));
  return dispatchWithContext({ ...toContextOpts(cli), dispatch });
}

async function main() {
  const out = await runCli(process.argv.slice(2));
  const summary = `included: ${out.included.join(', ') || 'none'}${out.truncated ? ' (truncated)' : ''}`;
  process.stdout.write(`=== fleet-context dispatch (${summary}) ===\n`);
  const payload = out.result;
  process.stdout.write(`${typeof payload === 'string' ? payload : (payload.content || JSON.stringify(payload))}\n`);
  if (payload && payload.provider) process.stderr.write(`[fleet-context-cli] provider: ${payload.provider}\n`);
}

if (require.main === module) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });
}

module.exports = { parseArgs, numericOpt, toContextOpts, freeCloudDispatch, runCli };
