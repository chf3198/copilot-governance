// tier: 2
// HAMR substrate probes — S2 spike (#877). Non-destructive, fail-soft, 5s timeout.
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before any credential read (canonical shim)
const { execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const TIMEOUT_MS = 5000
const timeoutAfter = ms => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
async function statusOf(url, headers) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try { return (await fetch(url, { headers, signal: controller.signal })).status } catch { return 0 }
  finally { clearTimeout(timer) }
}

/**
 * Cloudflare reachability + optional account-list check. Never logs token.
 * @returns {Promise<object>} Result with reachable and authenticated fields.
 */
async function probeCloudflare() {
  try {
    const status = await Promise.race([statusOf('https://api.cloudflare.com/client/v4/ips', {}), timeoutAfter(TIMEOUT_MS)])
    const base = { reachable: status >= 200 && status < 400 }
    const tok = process.env.CLOUDFLARE_API_TOKEN
    if (!tok) return { ...base, authenticated: false, reason: 'no-token' }
    const acctStatus = await Promise.race([statusOf('https://api.cloudflare.com/client/v4/accounts', { Authorization: `Bearer ${tok}` }), timeoutAfter(TIMEOUT_MS)])
    return { ...base, authenticated: acctStatus === 200 }
  } catch { return { reachable: false, authenticated: false, reason: 'error' } }
}

/**
 * R2 bucket list (read-only). Requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID.
 * @returns {Promise<object>} Result with available field.
 */
async function probeR2() {
  const tok = process.env.CLOUDFLARE_API_TOKEN
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!tok || !acct) return { available: false, reason: 'no-token' }
  try {
    const status = await Promise.race([
      statusOf(`https://api.cloudflare.com/client/v4/accounts/${acct}/r2/buckets`, { Authorization: `Bearer ${tok}` }),
      timeoutAfter(TIMEOUT_MS),
    ])
    return { available: status === 200 }
  } catch { return { available: false, reason: 'error' } }
}

/**
 * Wrangler CLI installed and version ≥4.0.0 or authenticated.
 * @returns {object} Result with available field.
 */
function probeWrangler() {
  try {
    const versionOut = execSync('wrangler --version', { timeout: TIMEOUT_MS, stdio: 'pipe' }).toString().trim()
    const major = versionOut.match(/(\d+)\./)
    if (major && parseInt(major[1], 10) >= 4) return { available: true, version: versionOut }
    const whoamiOut = execSync('wrangler whoami', { timeout: TIMEOUT_MS, stdio: 'pipe' }).toString()
    return { available: whoamiOut.includes('You are logged in'), reason: 'version-lt-4' }
  } catch { return { available: false, reason: 'not-installed-or-unauthenticated' } }
}

/**
 * GitHub OIDC trusted-publishing heuristic: admin or maintain on current repo.
 * @returns {Promise<object>} Result with eligible field and caveat.
 */
async function probeGithubOidc() {
  try {
    const { nameWithOwner } = JSON.parse(execSync('gh repo view --json nameWithOwner', { timeout: TIMEOUT_MS, stdio: 'pipe' }).toString())
    const perms = JSON.parse(execSync(`gh api repos/${nameWithOwner} --jq '.permissions'`, { timeout: TIMEOUT_MS, stdio: 'pipe' }).toString())
    return { eligible: !!(perms && (perms.admin || perms.maintain)), caveat: 'heuristic-only' }
  } catch { return { eligible: false, reason: 'gh-unavailable-or-no-access' } }
}

/**
 * MCP client capability: SDK in node_modules or config file present.
 * @returns {object} Result with available field and source.
 */
function probeMcp() {
  const sdk = path.join(process.cwd(), 'node_modules', '@modelcontextprotocol', 'sdk')
  if (fs.existsSync(sdk)) return { available: true, source: 'node_modules' }
  const cfgs = ['.claude/mcp.json', '.codex/mcp.json'].map(f => path.join(os.homedir(), f))
  const found = cfgs.find(cfg => fs.existsSync(cfg))
  return found ? { available: true, source: 'config-file' } : { available: false, reason: 'MCP SDK not installed' }
}

/**
 * npm trusted-publishing: whoami works + publishConfig.provenance set.
 * @returns {object} Result with eligible field.
 */
function probeNpmTrustedPublishing() {
  try { execSync('npm whoami', { timeout: TIMEOUT_MS, stdio: 'pipe' }) } catch { return { eligible: false, reason: 'npm-not-authenticated' } }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
    if (pkg.publishConfig?.provenance === true) return { eligible: true }
    return { eligible: 'partial', reason: 'authenticated-but-provenance-not-configured' }
  } catch { return { eligible: 'partial', reason: 'package-json-unreadable' } }
}

module.exports = { probeCloudflare, probeR2, probeWrangler, probeGithubOidc, probeMcp, probeNpmTrustedPublishing }
