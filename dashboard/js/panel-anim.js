// Shared panel-animation helpers — Epic #1339 C5 (#1356).
// Reusable pattern (extracted from C4 cf-pulse) for transient SSE-driven
// visual feedback. Honors prefers-reduced-motion via snap-to-state.

const PANEL_ANIM_DEFAULT_EXPIRY_MS = 1600;
const PANEL_ANIM_REDUCED_EXPIRY_MS = 400;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

/**
 * Add a transient class to an element; remove after expiry.
 * Honors prefers-reduced-motion (shorter snap-to-state expiry).
 *
 * @param {Element} element       Target DOM element
 * @param {string}  className     Class to toggle (e.g., 'aq-row-new')
 * @param {object}  [opts]
 * @param {number}  [opts.expiry] Override expiry ms (default 1600/400)
 */
function animatePanelUpdate(element, className, opts = {}) {
  if (!element || !element.classList) return;
  const reduced = prefersReducedMotion();
  const expiry = opts.expiry || (reduced ? PANEL_ANIM_REDUCED_EXPIRY_MS : PANEL_ANIM_DEFAULT_EXPIRY_MS);
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), expiry);
}

/**
 * Subscribe a panel target to an SSE event stream, calling onEvent for each.
 * Returns a cleanup function. Reuses /api/events/stream.
 *
 * @param {string}   eventType  SSE event type to listen for (e.g., 'incident')
 * @param {function} onEvent    Called with parsed JSON payload
 * @returns {function}          cleanup function
 */
function subscribePanelSSE(eventType, onEvent) {
  if (typeof window === 'undefined' || !window.EventSource) return () => {};
  // Reuse a single EventSource per page (one connection for all panels)
  if (!window.__panelSSE) window.__panelSSE = new EventSource('/api/events/stream');
  const handler = (event) => {
    try { onEvent(JSON.parse(event.data)); }
    catch { /* ignore parse errors */ }
  };
  window.__panelSSE.addEventListener(eventType, handler);
  return () => window.__panelSSE.removeEventListener(eventType, handler);
}

if (typeof module !== 'undefined') {
  module.exports = {
    animatePanelUpdate, prefersReducedMotion, subscribePanelSSE,
    PANEL_ANIM_DEFAULT_EXPIRY_MS, PANEL_ANIM_REDUCED_EXPIRY_MS,
  };
} else {
  Object.assign(window, {
    animatePanelUpdate, prefersReducedMotionForPanels: prefersReducedMotion, subscribePanelSSE,
  });
}
