// Credential Store — localStorage CRUD for fleet resources
// Never writes to repo files. Export/import via JSON.

const FLEET_STORE_KEY = 'devenv-fleet-resources';

function loadFleetResources() {
  try {
    return JSON.parse(localStorage.getItem(FLEET_STORE_KEY)) || [];
  } catch { return []; }
}

function saveFleetResources(resources) {
  localStorage.setItem(FLEET_STORE_KEY, JSON.stringify(resources));
}

function addFleetResource(resource) {
  const list = loadFleetResources();
  resource.id = resource.id || crypto.randomUUID();
  resource.createdAt = new Date().toISOString();
  list.push(resource);
  saveFleetResources(list);
  return resource;
}

function updateFleetResource(id, updates) {
  const list = loadFleetResources();
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
  saveFleetResources(list);
  return list[idx];
}

function deleteFleetResource(id) {
  const list = loadFleetResources().filter(r => r.id !== id);
  saveFleetResources(list);
}

function exportFleetConfig() {
  return JSON.stringify({
    version: 1, exportedAt: new Date().toISOString(),
    resources: loadFleetResources()
  }, null, 2);
}

function importFleetConfig(jsonStr) {
  const data = JSON.parse(jsonStr);
  if (!data.resources || !Array.isArray(data.resources)) {
    throw new Error('Invalid fleet config: missing resources array');
  }
  saveFleetResources(data.resources);
  return data.resources.length;
}

function reorderFleetResources(orderedIds) {
  const list = loadFleetResources();
  const map = Object.fromEntries(list.map(r => [r.id, r]));
  const ordered = orderedIds.map(id => map[id]).filter(Boolean);
  const rest = list.filter(r => !orderedIds.includes(r.id));
  saveFleetResources([...ordered, ...rest]);
}

const FLEET_AUDIT_KEY = 'devenv-fleet-audit';
function logAuditEntry(action, resourceId) {
  const log = JSON.parse(localStorage.getItem(FLEET_AUDIT_KEY) || '[]');
  log.push({ action, resourceId: resourceId || null, ts: new Date().toISOString() });
  if (log.length > 200) log.splice(0, log.length - 200);
  localStorage.setItem(FLEET_AUDIT_KEY, JSON.stringify(log));
}
