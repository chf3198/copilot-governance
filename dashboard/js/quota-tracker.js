// Quota Tracker — build quota display from service inventory
// Pure functions, no side effects

function buildQuotaList(services) {
  const quotas = [];
  const META = new Set(['period', 'note']);
  for (const svc of services) {
    if (!svc.quotas) continue;
    const period = svc.quotas.period || 'unknown';
    for (const [key, val] of Object.entries(svc.quotas)) {
      if (META.has(key) || typeof val !== 'number') continue;
      quotas.push({
        id: `${svc.id}-${key}`,
        name: `${svc.name}: ${formatKey(key)}`,
        limit: val,
        usage: 0,
        percent: 0,
        period
      });
    }
  }
  return quotas;
}

function formatKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

function updateQuotaUsage(quotas, serviceId, key, used) {
  return quotas.map(q => {
    if (q.id !== `${serviceId}-${key}`) return q;
    const percent = Math.min(100,
      Math.round((used / q.limit) * 100));
    return { ...q, usage: used, percent };
  });
}
