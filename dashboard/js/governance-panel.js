function renderGovernancePanel(state = {}) {
  const enabled = state.enabled ? 'enabled' : 'disabled';
  const hooks = state.hooks || {};
  const pre = hooks.PreToolUse || [];
  const user = hooks.UserPromptSubmit || [];
  const stop = hooks.Stop || [];
  const drift = state.audit?.git_state_drift || {};
  const driftSignals = drift.signals || {};
  const driftViolations = drift.violations || [];
  return `
    <div class="governance-grid">
      <div class="gov-card gov-status">
        <h3>Enforcement</h3>
        <p>Status: <strong>${enabled}</strong> · Repo scope: <code>${state.repoScope?.default_enabled ? 'true' : 'false'}</code></p>
      </div>
      <div class="gov-card gov-status">
        <h3>Git State Drift</h3>
        <p>Status: <strong>${escapeHtml(drift.status || 'UNAVAILABLE')}</strong> · Violations: <strong>${driftViolations.length}</strong></p>
        <p>Freshness: ${escapeHtml(driftSignals.freshness?.status || 'n/a')} · Worktree: ${escapeHtml(driftSignals.worktree?.status || 'n/a')} · Target: ${escapeHtml(driftSignals.target?.status || 'n/a')}</p>
      </div>
      <div class="gov-card gov-list">
        <h3>PreToolUse hooks (${pre.length})</h3>
        <ul>${pre.map(item => `<li>${escapeHtml(item.command)}</li>`).join('')}</ul>
      </div>
      <div class="gov-card gov-list">
        <h3>UserPromptSubmit hooks (${user.length})</h3>
        <ul>${user.map(item => `<li>${escapeHtml(item.command)}</li>`).join('')}</ul>
      </div>
      <div class="gov-card gov-list">
        <h3>Stop hooks (${stop.length})</h3>
        <ul>${stop.map(item => `<li>${escapeHtml(item.command)}</li>`).join('')}</ul>
      </div>
      <div class="gov-card gov-list">
        <h3>Drift Violations (${driftViolations.length})</h3>
        <ul>${driftViolations.map(item => `<li>${escapeHtml(item.signal)}: ${escapeHtml(item.status)} — ${escapeHtml(item.guidance || item.detail || '')}</li>`).join('') || '<li>None</li>'}</ul>
      </div>
    </div>
  `;
}

async function fetchGovernanceState() {
  try {
    const [cfg, audit] = await Promise.all([
      fetch('/api/governance'),
      fetch('/api/governance-audit').catch(() => null),
    ]);
    const config = cfg?.ok ? await cfg.json() : {};
    const auditData = audit && audit.ok ? await audit.json() : null;
    return { ...config, audit: auditData };
  } catch (e) {
    return { error: 'fetch failed' };
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

  if (typeof module !== 'undefined') module.exports = { renderGovernancePanel, fetchGovernanceState, escapeHtml };
  else Object.assign(window, { renderGovernancePanel, fetchGovernanceState, escapeHtml });
