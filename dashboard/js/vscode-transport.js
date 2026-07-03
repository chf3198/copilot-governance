// vscode-transport.js — VS Code Webview postMessage bridge
// Loads AFTER transport.js and BEFORE event-source.js.
// Active only when HOST_ENV === 'vscode'.
// Provides window.vsCodeBridge for use by event-source.js and other modules.

(function () {
  'use strict';
  if (window.HOST_ENV !== 'vscode') return;

  // Acquire the VS Code API handle once (calling it twice throws).
  const vscode = acquireVsCodeApi(); // eslint-disable-line no-undef
  window.vsCodeBridge = vscode;

  // Pending request callbacks: requestId → { resolve, reject, timeout }
  const _pending = Object.create(null);
  let _reqId = 0;
  const DEFAULT_TIMEOUT_MS = 8000;

  /**
   * Send a typed request to the extension host and return a Promise for the
   * response. The extension must reply with { requestId, type: 'response', data }.
   * @param {string} type — message type understood by the extension host
   * @param {object} [payload] — optional payload
   * @param {number} [timeoutMs] — default 8 000
   */
  function sendRequest(type, payload, timeoutMs) {
    const requestId = ++_reqId;
    const timeout = timeoutMs || DEFAULT_TIMEOUT_MS;
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        delete _pending[requestId];
        reject(new Error('vscode-transport: timeout for ' + type));
      }, timeout);
      _pending[requestId] = { resolve, reject, timer };
      vscode.postMessage({ type, requestId, payload: payload || {} });
    });
  }

  /**
   * Override connectSSE for the vscode mode.
   * The extension host pushes events via postMessage instead of SSE.
   * @param {object} app — Alpine component reference
   */
  window.connectSSEVscode = function connectSSEVscode(app) {
    vscode.postMessage({ type: 'subscribe', channel: 'events' });

    window.addEventListener('message', function (event) {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      // Resolve pending request/response pairs.
      if (msg.type === 'response' && msg.requestId && _pending[msg.requestId]) {
        const cb = _pending[msg.requestId];
        clearTimeout(cb.timer);
        delete _pending[msg.requestId];
        cb.resolve(msg.data);
        return;
      }

      // Route activity events into the Alpine state (same contract as SSE).
      if (msg.type === 'activity' || msg.type === 'event') {
        try {
          const payload = msg.data || msg;
          const activity = eventToActivity(payload); // defined in event-source.js
          addActivity(app.activityLog, activity.type, activity.message, activity.detail);
          if (payload.role && payload.issue) {
            app.batonState = mergeBatonEvents([payload]);
          }
        } catch { /* skip malformed */ }
      }
    });
  };

  // Expose sendRequest for other panels that need extension-host data.
  window.vsCodeRequest = sendRequest;
})();
