// tier: 3
const fs = require('fs');
const path = require('path');

function arg(name, d = '') { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : d; }
function num(v, d) { const parsed = Number(v); return Number.isFinite(parsed) ? parsed : d; }
function reason(status, text = '', e = '') {
  if (/timed out|timeout|aborted/i.test(`${e}`)) return 'timeout';
  if (/requires more system memory/i.test(text)) return 'memory';
  if (status >= 500) return 'http_5xx'; if (status >= 400) return 'http_4xx'; return 'transport';
}
async function req(method, host, api, body, timeoutMs) {
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    // hamr-bypass-ok: diagnostic — fleet model-management endpoints (/api/pull etc.) not production inference; metrics excluded via tier='diagnostic' in upstream callers
    const response = await fetch(`http://${host}:11434${api}`, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json' }, signal: ac.signal });
    const text = await response.text(); let data = {}; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: response.ok, status: response.status, data, text }; } finally { clearTimeout(timer); }
}
async function pullWithRetry(host, model, retries, timeoutMs) {
  for (let i = 0; i <= retries; i += 1) {
    try {
      const result = await req('POST', host, '/api/pull', { name: model, stream: false }, timeoutMs);
      if (result.ok) return { ok: true, attempts: i + 1, status: result.status };
      if (i === retries) return { ok: false, attempts: i + 1, reason: reason(result.status, result.text), error: result.data.error || result.text };
    } catch (e) { if (i === retries) return { ok: false, attempts: i + 1, reason: reason(0, '', e.message), error: e.message }; }
    await new Promise((x) => setTimeout(x, 1000 * (i + 1)));
  }
  return { ok: false, attempts: retries + 1, reason: 'unknown', error: 'unreachable' };
}
async function run(opts = {}) {
  const plan = JSON.parse(fs.readFileSync(opts.plan, 'utf8')); const out = { ts: new Date().toISOString(), dry_run: !opts.apply, devices: [] };
  for (const device of plan.devices || []) {
    const row = { id: device.id, host: device.host, pulls: [], deletes: [] }; out.devices.push(row);
    const tags = await req('GET', device.host, '/api/tags', null, 20000); const have = new Set((tags.data.models || []).map((m) => m.name));
    for (const m of device.pull || []) {
      if (!opts.apply) { row.pulls.push({ model: m, ok: true, dry_run: true }); continue; }
      const pullResult = await pullWithRetry(device.host, m, opts.retries, opts.timeoutMs); row.pulls.push({ model: m, ...pullResult }); if (pullResult.ok) have.add(m);
    }
    for (const m of device.delete || []) {
      const safe = [...have].filter((x) => x !== m).length > 0 && !((device.keep || []).includes(m));
      if (!opts.apply) { row.deletes.push({ model: m, ok: safe, dry_run: true, skipped: !safe }); continue; }
      if (!safe) { row.deletes.push({ model: m, ok: false, skipped: true, reason: 'safety_guard' }); continue; }
      const del = await req('DELETE', device.host, '/api/delete', { name: m }, 30000); row.deletes.push({ model: m, ok: del.ok, status: del.status, reason: del.ok ? null : reason(del.status, del.text) });
      if (del.ok) have.delete(m);
    }
    row.reconcile = { expected: device.expected || [...have], have: [...have], missing: (device.expected || [...have]).filter((m) => !have.has(m)) };
  }
  const outPath = opts.out || path.join(process.cwd(), 'test-results/fleet-rollout-runner.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`); return out;
}
if (require.main === module) {
  const plan = arg('plan', path.join(process.cwd(), 'test-results/fleet-rollout-plan.json')); if (!fs.existsSync(plan)) { console.error('missing --plan'); process.exit(1); }
  run({ plan, apply: process.argv.includes('--apply'), out: arg('out'), retries: num(arg('retries'), 2), timeoutMs: num(arg('timeout-ms'), 180000) })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { reason, pullWithRetry, run };
