// demo-overlay.js — scenario picker, demo banner, concept glossary
// Active only when window.IS_DEMO === true.

if (window.IS_DEMO) (function () {
  'use strict';

  const GLOSSARY = [
    ['Baton', 'The GitHub issue tracking a task. Only one role holds it at a time.'],
    ['Fleet Node', 'A local machine running Ollama models via Tailscale. Zero-cost inference.'],
    ['MCP Server', 'A Model Context Protocol server exposing tools (files, GitHub, search) to agents.'],
    ['G1 Governance', 'Highest-priority harness goal. Ticket-first, signed artifacts, audit trails.'],
    ['Transport Layer', 'Abstraction routing data calls to live backend or mock fixtures.'],
    ['HAMR', 'Cloudflare Worker routing governed provider calls across all agent teams.'],
    ['Phase Gate', 'Research-first checkpoint: Phase-1 waits until all Phase-0 children close.'],
  ];

  function getMeta() {
    return fetch('fixtures/meta.json').then(function (r) { return r.json(); });
  }

  function mountBanner(label) {
    const banner = document.createElement('div');
    banner.id = 'demo-banner';
    banner.innerHTML = '<span>\uD83C\uDFAD Demo Mode \u2014 <strong>' + label + '</strong></span>'
      + '<button id="demo-switch-btn">Switch Scenario</button>'
      + '<button id="demo-glossary-btn">\uD83D\uDCD6 Concepts</button>'
      + '<a href="https://github.com/chf3198/megingjord-harness#readme"'
      + ' target="_blank" rel="noopener noreferrer">Learn how it works</a>';
    document.body.prepend(banner);
    document.getElementById('demo-switch-btn').addEventListener('click', showPicker);
    document.getElementById('demo-glossary-btn').addEventListener('click', toggleGlossary);
  }

  function mountGlossary() {
    const glossary = document.createElement('aside');
    glossary.id = 'demo-glossary';
    glossary.hidden = true;
    glossary.innerHTML = '<h3>\uD83D\uDCD6 Concepts</h3><dl>'
      + GLOSSARY.map(function (e) { return '<dt>' + e[0] + '</dt><dd>' + e[1] + '</dd>'; }).join('')
      + '</dl><button id="demo-glossary-close">\u2715 Close</button>';
    document.body.append(glossary);
    document.getElementById('demo-glossary-close').addEventListener('click', function () {
      glossary.hidden = true;
    });
  }

  function toggleGlossary() {
    const glossaryEl = document.getElementById('demo-glossary');
    if (glossaryEl) glossaryEl.hidden = !glossaryEl.hidden;
  }

  function showPicker() {
    getMeta().then(function (meta) {
      const ov = document.createElement('div');
      ov.id = 'demo-picker';
      ov.innerHTML = '<div class="demo-picker-card"><h2>Choose a Demo Scenario</h2><ul>'
        + meta.scenarios.map(function (s) {
          return '<li><button data-name="' + s.name + '"><strong>' + s.label + '</strong>'
            + '<span>' + s.description + '</span></button></li>';
        }).join('') + '</ul></div>';
      document.body.append(ov);
      ov.addEventListener('click', function (e) {
        const btn = e.target.closest('button[data-name]');
        if (!btn) return;
        const name = btn.dataset.name;
        localStorage.setItem('demo-scenario', name);
        ov.remove();
        const label = (meta.scenarios.find(function (s) { return s.name === name; }) || {}).label || name;
        const strong = document.querySelector('#demo-banner strong');
        if (strong) strong.textContent = label;
        if (window.fixtureRunner) window.fixtureRunner.switch(name);
      });
    });
  }

  function init() {
    getMeta().then(function (meta) {
      const saved = localStorage.getItem('demo-scenario') || meta.default;
      const sc = meta.scenarios.find(function (s) { return s.name === saved; }) || meta.scenarios[0];
      mountBanner(sc.label);
      mountGlossary();
      if (!localStorage.getItem('demo-visited')) {
        localStorage.setItem('demo-visited', '1');
        showPicker();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
