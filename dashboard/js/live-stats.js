// Live Stats — fetch Ollama telemetry from fleet via proxy
// Returns per-device stats for dashboard rendering

const FETCH_TIMEOUT_MS = 5000;

async function fetchDeviceStats(deviceId) {
  const base = `/api/fleet/${deviceId}`;
  const [tags, ps, ver] = await Promise.all([
    safeFetch(`${base}/api/tags`),
    safeFetch(`${base}/api/ps`),
    safeFetch(`${base}/api/version`)
  ]);
  const models = (tags?.models || []).map(m => ({
    name: m.name,
    size: formatBytes(m.size || 0),
    params: m.details?.parameter_size || '?',
    quant: m.details?.quantization_level || '?'
  }));
  const running = (ps?.models || []).map(m => ({
    name: m.name,
    vram: m.size_vram || 0,
    expires: m.expires_at || null
  }));
  const totalVram = running.reduce((s, m) => s + m.vram, 0);
  return {
    id: deviceId,
    version: ver?.version || null,
    models,
    running,
    totalVram,
    online: !!tags
  };
}

async function fetchAllFleetStats(deviceIds) {
  const results = {};
  for (const id of deviceIds) {
    results[id] = await fetchDeviceStats(id);
  }
  return results;
}

async function safeFetch(url) {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, unitIndex)).toFixed(1);
  return `${val} ${units[unitIndex] || 'TB'}`;
}
