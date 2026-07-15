// Device Monitor — merged inventory via setup API (#3173).
async function loadDevices() {
  try {
    const response = await fetch('/api/fleet/inventory');
    const payload = await response.json();
    const devices = payload.inventory?.devices || payload.devices?.devices || [];
    return devices.map((device) => ({
      id: device.id,
      alias: device.alias || device.hostname,
      role: device.role || device.capabilities?.[0] || 'node',
      ram: device.ram?.total || 'unknown',
      modelCount: (device.ollamaModels || []).length,
      tailscaleIP: device.tailscaleIP || device.resolvedIP || null,
      ollama: device.ollama || (device.ollamaModels || []).length > 0,
      openclaw: (device.services || []).includes('openclaw-gateway'),
      local: !!device.local,
      status: device.probeReachable ? 'online' : 'unknown',
    }));
  } catch {
    return [];
  }
}

async function loadServices() {
  try {
    const response = await fetch('/api/fleet/inventory');
    const payload = await response.json();
    const data = payload.services || {};
    const all = [...(data.subscriptions || []), ...(data.freeTier || []), ...(data.selfHosted || [])];
    return all.map((service) => ({
      id: service.id,
      name: service.name,
      type: service.type || (service.cost ? 'paid' : 'free'),
      cost: service.cost || 'free',
      quotas: service.quotas,
      status: service.status || 'unknown',
    }));
  } catch {
    return [];
  }
}
