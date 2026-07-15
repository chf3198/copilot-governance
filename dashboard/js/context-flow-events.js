// Context Flow Events — wires SSE activity to SVG node/arrow animations.
// Epic #1339 C4 (#1355) extends to honor prefers-reduced-motion.

let _lastCfAnimTs = 0;
const CF_DEBOUNCE_MS = 2000;
const CF_ANIM_EXPIRY_MS = 1800;  // matches cf-pulse-v2 1.6s + small buffer
const CF_REDUCED_MOTION_EXPIRY_MS = 400;  // snap-to-state quickly
const CF_IDLE_SWEEP_MS = 30000;

function _cfPrefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}
const CF_FLEET_PATTERN = /qwen|ollama|fleet|openclaw/;
const CF_FLEET_NODES = [0, 1, 4, 5, 6];
const CF_CLOUD_NODES = [0, 1, 2];
const CF_GIT_NODES = [0, 3];
const CF_MERGE_NODES = [3];
const CF_DEPLOY_NODES = [9, 5];

function _cfNodes(indices) {
  const all = document.querySelectorAll('.cf-node-g');
  return indices.map(idx => all[idx]).filter(Boolean);
}

function _cfAnimate(indices) {
  const now = Date.now();
  if (now - _lastCfAnimTs < CF_DEBOUNCE_MS) return;
  _lastCfAnimTs = now;
  // Reduced-motion: snap-to-state via the same class but CSS overrides animation
  const reduced = _cfPrefersReducedMotion();
  const expiry = reduced ? CF_REDUCED_MOTION_EXPIRY_MS : CF_ANIM_EXPIRY_MS;
  _cfNodes(indices).forEach(node => {
    node.classList.add('cf-active');
    setTimeout(() => node.classList.remove('cf-active'), expiry);
  });
}

function _cfMapEvent(data) {
  const eventType = data.type || '';
  const model = (data.model || '').toLowerCase();
  const isFleet = CF_FLEET_PATTERN.test(model);
  if (eventType.startsWith('git:commit') || eventType.startsWith('git:pr')) return CF_GIT_NODES;
  if (eventType.startsWith('git:merge')) return CF_MERGE_NODES;
  if (eventType.startsWith('baton:') || eventType.startsWith('ticket:role')) {
    return isFleet ? CF_FLEET_NODES : CF_CLOUD_NODES;
  }
  if (eventType.startsWith('deploy:')) return CF_DEPLOY_NODES;
  return null;
}

// Wrap global handleSSEvent to intercept raw SSE data before activity-log conversion.
// Guarded for Node.js test-runner context where `window` is undefined.
if (typeof window !== 'undefined') {
  (function () {
    const _origHandle = typeof handleSSEvent === 'function' ? handleSSEvent : null;
    window.handleSSEvent = function (app, event) {
      if (_origHandle) _origHandle(app, event);
      try {
        const data = JSON.parse(event.data);
        const nodeIndices = _cfMapEvent(data);
        if (nodeIndices) _cfAnimate(nodeIndices);
      } catch { /* skip malformed */ }
    };
  }());
}

function initContextFlowEvents() {
  setInterval(() => {
    document.querySelectorAll('.cf-active').forEach(element => element.classList.remove('cf-active'));
  }, CF_IDLE_SWEEP_MS);
}

if (typeof module !== 'undefined') {
  module.exports = { _cfMapEvent, _cfAnimate, initContextFlowEvents, _cfPrefersReducedMotion };
} else {
  Object.assign(window, { _cfMapEvent, _cfAnimate, initContextFlowEvents, _cfPrefersReducedMotion });
}
