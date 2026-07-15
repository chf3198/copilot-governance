// Baton Flow animation sidecar — Epic #1339 C5 (#1356).
// Subscribes to SSE baton:* events; adds bf-active-transition class to the
// matching baton-step element. Reduced-motion honored via shared
// panel-anim.js. Sidecar pattern keeps baton-flow.js untouched (line-cap).

const BF_ROLE_INDEX = {
  manager: 0,
  collaborator: 1,
  admin: 2,
  consultant: 3,
};

function _bfFindActiveStepInRow(rowElement) {
  if (!rowElement || !rowElement.querySelectorAll) return null;
  const steps = rowElement.querySelectorAll('.baton-step.active');
  return steps.length > 0 ? steps[0] : null;
}

function _bfMatchRowByIssue(issueNumber) {
  if (typeof document === 'undefined') return null;
  const rows = document.querySelectorAll('.baton-row');
  for (const row of rows) {
    const issueElement = row.querySelector('.baton-issue');
    if (!issueElement) continue;
    const text = issueElement.textContent || '';
    if (text.includes('#' + issueNumber)) return row;
  }
  return null;
}

function _bfHandleBatonEvent(payload) {
  if (!payload || typeof payload !== 'object') return;
  const issueNumber = payload.issue || payload.issue_number || payload.ticket;
  if (!issueNumber) return;
  const row = _bfMatchRowByIssue(String(issueNumber));
  if (!row) return;
  const activeStep = _bfFindActiveStepInRow(row);
  if (!activeStep) return;
  if (typeof window.animatePanelUpdate === 'function') {
    window.animatePanelUpdate(activeStep, 'bf-active-transition');
  }
}

function initBatonFlowAnim() {
  if (typeof window === 'undefined' || !window.EventSource) return null;
  if (window.__batonFlowAnimInit) return window.__batonFlowAnimInit;
  if (typeof window.subscribePanelSSE !== 'function') return null;
  const cleanups = [];
  for (const eventType of ['baton:manager', 'baton:collaborator', 'baton:admin', 'baton:consultant', 'baton']) {
    cleanups.push(window.subscribePanelSSE(eventType, _bfHandleBatonEvent));
  }
  window.__batonFlowAnimInit = () => cleanups.forEach((cleanupFn) => cleanupFn());
  return window.__batonFlowAnimInit;
}

if (typeof window !== 'undefined') {
  window.initBatonFlowAnim = initBatonFlowAnim;
  // Auto-init on DOM ready when included as a script tag
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBatonFlowAnim);
  } else {
    setTimeout(initBatonFlowAnim, 0);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    initBatonFlowAnim,
    _bfHandleBatonEvent, _bfMatchRowByIssue, _bfFindActiveStepInRow,
    BF_ROLE_INDEX,
  };
}
