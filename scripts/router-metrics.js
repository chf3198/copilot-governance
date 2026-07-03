const fs = require('fs');
const path = require('path');
const os = require('os');

function getRouterMetrics() {
  try {
    const stateDirs = [
      path.join(os.homedir(), '.copilot', 'hooks', 'state'),
      path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'devenv-ops', 'state'),
    ];
    const files = stateDirs.flatMap((dir) => fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.startsWith('repo-') && f.endsWith('.json')).map((f) => path.join(dir, f))
      : []);
    let free = 0, fleet = 0, premium = 0;
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(f, 'utf8'));
        const lane = (data.routing && (data.routing.lane || data.routing.recommended_model)) || 'free';
        if (lane === 'fleet') fleet++; else if (lane === 'premium') premium++; else free++;
      } catch (e) { /* ignore malformed */ }
    }
    return { timestamp: new Date().toISOString(), lanes: { free, fleet, premium } };
  } catch (e) {
    return { timestamp: new Date().toISOString(), lanes: { free: 0, fleet: 0, premium: 0 } };
  }
}

module.exports = { getRouterMetrics };
