// markdown-magic v4.x custom transforms for README compile pipeline (#796)
const fs = require('fs');
const path = require('path');

function readPkg() {
  const pkgPath = path.join(process.cwd(), 'package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
}

function packageScripts() {
  const pkg = readPkg();
  const scripts = pkg.scripts || {};
  const entries = Object.entries(scripts).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return '_No scripts defined._';
  const rows = entries.map(([name, cmd]) => `| \`${name}\` | \`${escapePipe(cmd)}\` |`);
  return ['| Script | Command |', '|---|---|', ...rows].join('\n');
}

function escapePipe(s) {
  return String(s).replace(/\|/g, '\\|');
}

module.exports = { packageScripts };
