// Settings Form — Add/Edit resource dialog
// Renders provider-aware form with preset auto-fill

function renderResourceForm(existing) {
  const presets = listProviderPresets();
  const opts = presets.map(p =>
    `<option value="${p.id}" ${existing?.provider===p.id?'selected':''}>${p.label} (${p.tier})</option>`
  ).join('');
  const r = existing || {};
  const preset = existing ? getProviderPreset(existing.provider) : null;
  const keyLabel = preset?.authLabel || 'API Key';
  const keyHint = preset?.authPlaceholder || 'sk-...';
  return `<div class="settings-form" id="resource-form">
    <h3>${r.id ? 'Edit' : 'Add'} Resource</h3>
    <label>Provider<select id="rf-provider" onchange="applyPreset(this.value)">
      <option value="">Select...</option>${opts}</select></label>
    <label>Name<input id="rf-name" value="${esc(r.name||'')}"/></label>
    <label>Base URL<input id="rf-url" value="${esc(r.baseUrl||'')}"
      placeholder="http://localhost:11434"/></label>
    <label>Auth Type<select id="rf-auth">
      <option value="none" ${r.auth?.type==='none'?'selected':''}>None</option>
      <option value="bearer" ${r.auth?.type==='bearer'?'selected':''}>Bearer Token</option>
      <option value="header" ${r.auth?.type==='header'?'selected':''}>Custom Header</option>
      <option value="query-param" ${r.auth?.type==='query-param'?'selected':''}>Query Param (secret)</option>
    </select></label>
    <label><span id="rf-key-label">${keyLabel}</span><input id="rf-key" type="password"
      value="${esc(r.auth?.key||'')}" placeholder="${keyHint}"/></label>
    <label>Tags<input id="rf-tags" value="${esc((r.tags||[]).join(', '))}"
      placeholder="gpu, fast, free"/></label>
    <label><input type="checkbox" id="rf-enabled"
      ${r.enabled!==false?'checked':''}/> Enabled</label>
    <div class="form-btns">
      <button onclick="saveResourceForm('${r.id||''}')">💾 Save</button>
      <button onclick="closeForm()">Cancel</button>
    </div>
  </div>`;
}

function applyPreset(providerId) {
  const p = getProviderPreset(providerId);
  if (!p) return;
  const name = document.getElementById('rf-name');
  const url = document.getElementById('rf-url');
  const auth = document.getElementById('rf-auth');
  const keyLabel = document.getElementById('rf-key-label');
  const keyInput = document.getElementById('rf-key');
  if (!name.value) name.value = p.label;
  if (!url.value || url.value === '') url.value = p.baseUrl;
  auth.value = p.authType || 'none';
  if (keyLabel) keyLabel.textContent = p.authLabel || 'API Key';
  if (keyInput) keyInput.placeholder = p.authPlaceholder || 'sk-...';
}
