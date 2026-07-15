// Health Check — ping Ollama and OpenClaw endpoints
// Returns status objects for each device

const HEALTH_TIMEOUT_MS = 5000;

async function checkOllama(deviceId) {
  const probe = () => fetch(`/api/fleet/${deviceId}/api/tags`, {
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
  });
  for (let i = 0; i < 2; i++) {
    try {
      if (i > 0) await new Promise(r => setTimeout(r, 500));
      const r = await probe();
      if (r.status === 502 || r.status === 504) {
        if (i < 1) continue;
        return { status: 'offline', models: [] };
      }
      if (!r.ok) return { status: 'error', models: [] };
      const data = await r.json();
      return { status: 'healthy', models: (data.models || []).map(m => m.name) };
    } catch { if (i < 1) continue; }
  }
  return { status: 'offline', models: [] };
}

async function checkOpenClaw(deviceId) {
  try {
    const url = `/api/fleet/${deviceId}/openclaw/health`;
    const r = await fetch(url, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    });
    if (r.status === 502 || r.status === 504) return { status: 'offline' };
    return r.ok ? { status: 'healthy' } : { status: 'error' };
  } catch {
    return { status: 'offline' };
  }
}

async function runHealthChecks(devices) {
  const results = {};
  for (const d of devices) {
    if (d.local) {
      results[d.id] = { status: 'healthy' };
      continue;
    }
    if (!d.ollama && !d.openclaw) {
      results[d.id] = { status: 'unknown' };
      continue;
    }
    const ollama = d.ollama
      ? await checkOllama(d.id) : null;
    const openclaw = d.openclaw
      ? await checkOpenClaw(d.id) : null;

    if (ollama?.status === 'healthy') {
      results[d.id] = { status: 'healthy', ...ollama };
    } else if (openclaw?.status === 'healthy') {
      results[d.id] = { status: 'degraded' };
    } else {
      results[d.id] = { status: ollama?.status || 'unknown' };
    }
  }
  return results;
}

function mergeHealthStatus(devices, checks) {
  return devices.map(d => ({
    ...d,
    status: checks[d.id]?.status || d.status
  }));
}
if(typeof module!=="undefined")module.exports={mergeHealthStatus,runHealthChecks,checkOllama,checkOpenClaw,HEALTH_TIMEOUT_MS};else Object.assign(window,{mergeHealthStatus,runHealthChecks,checkOllama,checkOpenClaw,HEALTH_TIMEOUT_MS});
