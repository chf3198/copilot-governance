// transport.js — environment detection
// Must load BEFORE all other scripts. Sets window.IS_DEMO and window.HOST_ENV.
// HOST_ENV: 'demo' (github.io or ?demo=1) | 'vscode' (acquireVsCodeApi present)
//           | 'local' (default dev server)
// Function overrides applied by transport-mocks.js (demo) / vscode-transport.js

(function () {
  'use strict';
  const params = new URLSearchParams(window.location.search);
  const isDemo = window.location.hostname.includes('github.io')
    || params.get('demo') === '1';
  const isVscode = !isDemo && typeof acquireVsCodeApi !== 'undefined';
  window.IS_DEMO = isDemo;
  window.HOST_ENV = isDemo ? 'demo' : isVscode ? 'vscode' : 'local';
})();
