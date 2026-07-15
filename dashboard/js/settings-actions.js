// Settings Actions — wiring for Add/Edit/Delete/Export/Import
// Integrates credential-store, fleet-probe, settings-form

window._fleetLocked = true; // always locked on page load

function toggleFleetLock() {
  window._fleetLocked = !window._fleetLocked;
  logAuditEntry(window._fleetLocked ? 'lock' : 'unlock', null);
  refreshSettingsView();
}

function showAddResource() {
  const panel = document.getElementById('settings-form-container');
  if (panel) panel.innerHTML = renderResourceForm();
}

function editResource(id) {
  if (window._fleetLocked) return;
  const list = loadFleetResources();
  const r = list.find(x => x.id === id);
  if (!r) return;
  const panel = document.getElementById('settings-form-container');
  if (panel) panel.innerHTML = renderResourceForm(r);
}

function removeResource(id) {
  if (window._fleetLocked) return;
  if (!confirm('Remove this resource?')) return;
  logAuditEntry('delete', id);
  deleteFleetResource(id);
  refreshSettingsView();
}

function saveResourceForm(existingId) {
  const provider = document.getElementById('rf-provider').value;
  const preset = getProviderPreset(provider);
  const resource = {
    name: document.getElementById('rf-name').value,
    provider, tier: preset?.tier || 'custom',
    baseUrl: document.getElementById('rf-url').value,
    apiFormat: preset?.apiFormat || 'openai-compat',
    healthEndpoint: preset?.healthEndpoint || '/v1/models',
    modelsEndpoint: preset?.modelsEndpoint || '/v1/models',
    auth: {
      type: document.getElementById('rf-auth').value,
      key: document.getElementById('rf-key').value,
      headerName: preset?.authHeaderName || undefined
    },
    tags: document.getElementById('rf-tags').value
      .split(',').map(t => t.trim()).filter(Boolean),
    enabled: document.getElementById('rf-enabled').checked
  };
  if (existingId) {
    logAuditEntry('edit', existingId);
    updateFleetResource(existingId, resource);
  } else {
    addFleetResource(resource);
  }
  closeForm();
  refreshSettingsView();
}

function closeForm() {
  const panel = document.getElementById('settings-form-container');
  if (panel) panel.innerHTML = '';
}

async function probeAll() {
  window._lastProbeResults = await probeAllResources(loadFleetResources());
  refreshSettingsView();
}

function exportConfig() {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([exportFleetConfig()], { type: 'application/json' })),
    download: `fleet-config-${Date.now()}.json` });
  a.click(); URL.revokeObjectURL(a.href);
}

function importConfig(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const count = importFleetConfig(reader.result);
      alert(`Imported ${count} resources.`);
      refreshSettingsView();
    } catch (e) { alert('Import failed: ' + e.message); }
  };
  reader.readAsText(file);
}

function refreshSettingsView() {
  const el = document.getElementById('settings-content');
  if (!el) return;
  const res = loadFleetResources();
  el.innerHTML = renderSettingsPanel(res, window._lastProbeResults, window._hostInfo);
}
