// Config Panel — local dashboard preferences

function loadDashboardConfig() {
  try {
    const raw = localStorage.getItem('devenv-dashboard-config');
    if (!raw) return { refreshSec: 5, highContrast: false, tooltipsEnabled: false };
    const cfg = JSON.parse(raw);
    return {
      refreshSec: Number(cfg.refreshSec || 5),
      highContrast: !!cfg.highContrast,
      tooltipsEnabled: !!cfg.tooltipsEnabled
    };
  } catch {
    return { refreshSec: 5, highContrast: false, tooltipsEnabled: false };
  }
}

function saveDashboardConfig(config) {
  localStorage.setItem('devenv-dashboard-config', JSON.stringify(config));
}

function renderConfigPanel(config, enabled, tips) {
  const status = enabled ? 'Enabled' : 'Paused';
  return `<div class="config-grid">
    <p><strong>Auto refresh:</strong> ${status}
      <label class="refresh-ctl">
        <input type="range" min="3" max="60" value="${config.refreshSec}"
          oninput="this.nextElementSibling.textContent=this.value+'s';setRefreshSec(this.value)"/>
        <span>${config.refreshSec}s</span></label></p>
    <p><strong>High contrast:</strong> ${config.highContrast ? 'On' : 'Off'}</p>
    <p><strong>Tooltips:</strong> ${tips ? 'On' : 'Off'}</p>
    <p class="config-note">Drag slider to set refresh interval (3–60s).</p>
  </div>${renderFleetSettingsPanel()}`;
}
