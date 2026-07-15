/* global loadFleetResources, listProviderPresets, getProviderPreset, esc */

function openEditModal(id) {
  const list = loadFleetResources();
  const r = id ? list.find(x => x.id === id) : {};
  const isNew = !id;
  const overlay = document.getElementById('settings-modal-overlay');
  if (!overlay) return;
  overlay.innerHTML = renderModal(r, isNew);
  overlay.classList.add('modal-open');
  overlay.querySelector('#rf-provider')?.focus();
}

function closeModal() {
  const overlay = document.getElementById('settings-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('modal-open');
  overlay.innerHTML = '';
}

function renderModal(r, isNew) {
  const presets = listProviderPresets();
  const opts = presets.map(p =>
    `<option value="${p.id}" ${r?.provider===p.id?'selected':''}>`
    + `${p.label} (${p.tier})</option>`).join('');
  const preset = r?.provider ? getProviderPreset(r.provider) : null;
  const keyLabel = preset?.authLabel || 'API Key';
  const keyHint = preset?.authPlaceholder || 'sk-...';
  return `<div class="modal-backdrop" onclick="closeModal()">
    <div class="modal-card" onclick="event.stopPropagation()">
      <h3>${isNew ? 'Add' : 'Edit'} Resource</h3>
      <label>Provider<select id="rf-provider"
        onchange="applyPreset(this.value)">
        <option value="">Select...</option>${opts}</select></label>
      <label>Name<input id="rf-name"
        value="${esc(r?.name||'')}"/></label>
      <label>Base URL<input id="rf-url"
        value="${esc(r?.baseUrl||'')}"
        placeholder="http://localhost:11434"/></label>
      <label>Auth Type<select id="rf-auth">
        <option value="none" ${r?.auth?.type==='none'?'selected':''}>None</option>
        <option value="bearer" ${r?.auth?.type==='bearer'?'selected':''}>Bearer</option>
        <option value="header" ${r?.auth?.type==='header'?'selected':''}>Header</option>
        <option value="query-param" ${r?.auth?.type==='query-param'?'selected':''}>Query</option>
      </select></label>
      <label>${keyLabel}<input id="rf-key" type="password"
        value="${esc(r?.auth?.key||'')}"
        placeholder="${keyHint}"/></label>
      <label>Tags<input id="rf-tags"
        value="${esc((r?.tags||[]).join(', '))}"
        placeholder="gpu, fast, free"/></label>
      <label><input type="checkbox" id="rf-enabled"
        ${r?.enabled!==false?'checked':''}/> Enabled</label>
      <div class="modal-btns">
        <button class="modal-save"
          onclick="saveResourceForm('${r?.id||''}')">
          💾 Save</button>
        <button onclick="closeModal()">Cancel</button>
      </div>
    </div></div>`;
}

function maskSecret(key) {
  if (!key) return '';
  return '••••••••' + (key.length > 4 ? key.slice(-4) : '');
}

const _revealTimers = {};
function toggleReveal(id) {
  const el = document.querySelector(`[data-secret-id="${id}"]`);
  if (!el) return;
  const list = loadFleetResources();
  const r = list.find(x => x.id === id);
  if (!r?.auth?.key) return;
  if (el.dataset.revealed === 'true') {
    el.textContent = maskSecret(r.auth.key);
    el.dataset.revealed = 'false';
    return;
  }
  el.textContent = r.auth.key;
  el.dataset.revealed = 'true';
  clearTimeout(_revealTimers[id]);
  _revealTimers[id] = setTimeout(() => {
    el.textContent = maskSecret(r.auth.key);
    el.dataset.revealed = 'false';
  }, 5000);
}

Object.assign(window, { openEditModal, closeModal, toggleReveal });
