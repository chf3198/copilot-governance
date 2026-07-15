// Fleet Probe — health check configured resources via server proxy
// Local resources use /api/fleet/ proxy; cloud validated client-side

const PROBE_TIMEOUT_MS = 5000;

async function probeResource(resource) {
  if (!resource.enabled || !resource.baseUrl) {
    return { ...resource, status: 'disabled', checkedAt: now() };
  }
  if (resource.tier === 'cloud') return probeCloudResource(resource);
  return probeLocalResource(resource);
}

async function probeLocalResource(resource) {
  const deviceId = resource.id;
  const ep = resource.healthEndpoint || '/api/tags';
  const proxyUrl = `/api/fleet/${deviceId}${ep}`;
  try {
    const res = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    });
    if (!res.ok) {
      return { ...resource, status: 'error', statusCode: res.status, checkedAt: now() };
    }
    const data = await res.json().catch(() => ({}));
    const models = extractModels(data, resource.provider);
    return { ...resource, status: 'healthy', models, checkedAt: now() };
  } catch (e) {
    const msg = e.name === 'TimeoutError' ? 'timeout' : e.message;
    return { ...resource, status: 'offline', error: msg, checkedAt: now() };
  }
}

function probeCloudResource(resource) {
  const auth = resource.auth || {};
  const needsKey = auth.type && auth.type !== 'none';
  if (needsKey && !auth.key) {
    return { ...resource, status: 'no-key', checkedAt: now() };
  }
  return { ...resource, status: 'ready', checkedAt: now() };
}

function extractModels(data, provider) {
  if (provider === 'ollama' && data.models) {
    return data.models.map(m => m.name);
  }
  if (data.data && Array.isArray(data.data)) {
    return data.data.map(m => m.id).slice(0, 20);
  }
  return [];
}

async function probeAllResources(resources) {
  const enabled = (resources || []).filter(r => r.enabled);
  return Promise.all(enabled.map(r => probeResource(r)));
}

function now() { return new Date().toISOString(); }
