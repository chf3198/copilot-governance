// SSE Event Source — live push from /api/events/stream
// Falls back to polling on error or unsupported environments

let _eventSource = null;
let _fallbackTimer = null;
const SSE_URL = '/api/events/stream';
const FALLBACK_MS = 5000;

/** Connect SSE and dispatch events into Alpine state */
function connectSSE(app) {
  if (window.IS_DEMO) {
    if (window.fixtureRunner) window.fixtureRunner.start(app, localStorage.getItem('demo-scenario'));
    return;
  }
  if (window.HOST_ENV === 'vscode') {
    if (typeof window.connectSSEVscode === 'function') window.connectSSEVscode(app);
    return;
  }
  if (typeof EventSource === 'undefined') return startFallback(app);
  try { _eventSource = new EventSource(SSE_URL); } catch { return startFallback(app); }

  _eventSource.addEventListener('connected', () => {
    addActivity(app.activityLog, 'system', 'SSE connected', 'Live push active');
  });

  _eventSource.addEventListener('activity', (e) => {
    handleSSEvent(app, e);
  });

  // Generic message handler for unnamed events
  _eventSource.onmessage = (e) => handleSSEvent(app, e);

  _eventSource.onerror = () => {
    _eventSource.close();
    _eventSource = null;
    addActivity(app.activityLog, 'warn', 'SSE disconnected', 'Falling back to polling');
    startFallback(app);
  };
}

function handleSSEvent(app, event) {
  try {
    const data = JSON.parse(event.data);
    const a = eventToActivity(data);
    addActivity(app.activityLog, a.type, a.message, a.detail);
    if (data.role && data.issue) {
      app.batonState = mergeBatonEvents([data]);
    }
  } catch { /* skip malformed */ }
}

function startFallback(app) {
  if (_fallbackTimer) return;
  _fallbackTimer = setInterval(async () => {
    try { await pollEventBus(app.activityLog); } catch { /* ignore */ }
  }, FALLBACK_MS);
}

/** Disconnect SSE + clear fallback */
function disconnectSSE() {
  if (_eventSource) { _eventSource.close(); _eventSource = null; }
  if (_fallbackTimer) { clearInterval(_fallbackTimer); _fallbackTimer = null; }
}
