#!/usr/bin/env node
// Global dashboard server — launchable from any directory
// Serves static from ~/.copilot/dashboard/, APIs from ~/.copilot/
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const COPILOT = process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot');
const DASH = path.join(COPILOT, 'dashboard');
const PORT = process.env.DASH_PORT || 8090;
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };

if (!fs.existsSync(DASH)) {
  console.error(`Dashboard not found at ${DASH}. Run deploy first.`);
  process.exit(1);
}

function serveStatic(req, res) {
  const pn = req.url.split('?')[0];
  let fp = path.join(DASH, pn === '/' ? 'index.html' : pn);
  fp = path.resolve(fp);
  if (!fp.startsWith(DASH)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) {
    fp = path.join(fp, 'index.html');
  }
  const ext = path.extname(fp);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const { handleApi } = require('./dashboard-api');

http.createServer((req, res) => {
  if (req.url.split('?')[0].startsWith('/api/')) return handleApi(req, res, COPILOT);
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Serving from: ${DASH}`);
  console.log(`Runtime: ${COPILOT}`);
});
