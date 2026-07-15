// Fleet Settings — UI preferences only; secrets use /api/fleet/setup/credentials (#3173).
const OPENCLAW_DEFAULT_PORT = 4000;
const OLLAMA_DEFAULT_PORT = 11434;

function loadFleetSettings() {
  const defaults = {
    fleetIPs: { 'operator-host': '', 'fleet-gpu': '' },
    sshUser: 'admin',
    openclawPort: OPENCLAW_DEFAULT_PORT,
    ollamaPort: OLLAMA_DEFAULT_PORT,
    endpoints: { openclaw: '', cloudflare: '' },
    autoDetect: true,
  };
  try {
    const saved = JSON.parse(localStorage.getItem('fleetSettings') || '{}');
    return { ...defaults,
      fleetIPs: { ...defaults.fleetIPs, ...saved.fleetIPs },
      endpoints: { ...defaults.endpoints, ...saved.endpoints },
      sshUser: saved.sshUser || defaults.sshUser,
      openclawPort: saved.openclawPort || defaults.openclawPort,
      ollamaPort: saved.ollamaPort || defaults.ollamaPort,
      autoDetect: saved.autoDetect !== undefined ? saved.autoDetect : true };
  } catch { return defaults; }
}

function saveFleetSettings(settings) {
  localStorage.setItem('fleetSettings', JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('fleet-settings-changed', { detail: settings }));
}

function renderFleetSettingsPanel() {
  const settings = loadFleetSettings();
  const devices = Object.entries(settings.fleetIPs);
  return `<div class="settings-form">
    <p>API keys are configured via the Fleet Setup wizard (server-side keychain/.env).</p>
    <h3 style="color:var(--blue);font-size:0.85rem;margin:0 0 8px">Fleet Devices</h3>
    <label><input type="checkbox" ${settings.autoDetect ? 'checked' : ''}
      onchange="toggleAutoDetect(this.checked)"> Auto-detect via Tailscale</label>
    ${devices.map(([id, ip]) => `<label>${id}
      <input type="text" value="${ip}" placeholder="auto-detect"
        ${settings.autoDetect ? 'disabled' : ''}
        onchange="updateFleetIP('${id}', this.value)">
    </label>`).join('')}
    <label>SSH User<input type="text" value="${settings.sshUser}"
      onchange="updateSetting('sshUser', this.value)"></label>
  </div>`;
}

function toggleAutoDetect(on) { const s = loadFleetSettings(); s.autoDetect = on; saveFleetSettings(s); }
function updateFleetIP(id, val) { const s = loadFleetSettings(); s.fleetIPs[id] = val.trim(); saveFleetSettings(s); }
function updateSetting(key, val) { const s = loadFleetSettings(); s[key] = val.trim(); saveFleetSettings(s); }
