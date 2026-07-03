// #3173 — 5-step Fleet Setup wizard (credentials via server API, not localStorage).
async function fetchFleetSetupStatus() {
  const response = await fetch('/api/fleet/setup/status');
  if (!response.ok) throw new Error('fleet setup status unavailable');
  return response.json();
}

async function postFleetSetup(action, body) {
  const response = await fetch(`/api/fleet/setup/${action}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `${action} failed`);
  return payload;
}

function renderFleetSetupWizard(status) {
  const missing = (status.missingOptionalKeys || []).join(', ') || 'none';
  return `<section class="fleet-setup-wizard" aria-label="Fleet Setup">
    <ol>
      <li>Tailscale — join your tailnet and authenticate locally.</li>
      <li>Discover — <button type="button" onclick="runFleetDiscover()">Run discover</button></li>
      <li>Probe — <button type="button" onclick="runFleetProbe()">Run capability probe</button></li>
      <li>Credentials — server writes keychain/.env (never localStorage)
        <form onsubmit="return saveFleetCredential(event)">
          <input name="credName" placeholder="OPENROUTER_API_KEY" required>
          <input name="credValue" type="password" placeholder="value" required>
          <button type="submit">Save</button>
        </form></li>
      <li>Verify — overlay=${status.overlay} devices=${status.deviceCount} missing=${missing}</li>
    </ol></section>`;
}

async function registerFleetSetupPanel(element) {
  if (!element) return;
  try { element.innerHTML = renderFleetSetupWizard(await fetchFleetSetupStatus()); }
  catch (error) { element.innerHTML = `<p class="hamr-error">${error.message}</p>`; }
}

async function runFleetDiscover() { await postFleetSetup('discover'); await registerFleetSetupPanel(document.getElementById('fleet-setup-target')); }
async function runFleetProbe() { await postFleetSetup('probe'); await registerFleetSetupPanel(document.getElementById('fleet-setup-target')); }
async function saveFleetCredential(event) {
  event.preventDefault();
  const form = event.target;
  await postFleetSetup('credentials', { name: form.credName.value, value: form.credValue.value });
  form.reset();
  await registerFleetSetupPanel(document.getElementById('fleet-setup-target'));
  return false;
}

if (typeof window !== 'undefined') {
  window.registerFleetSetupPanel = registerFleetSetupPanel;
  window.runFleetDiscover = runFleetDiscover;
  window.runFleetProbe = runFleetProbe;
  window.saveFleetCredential = saveFleetCredential;
}
