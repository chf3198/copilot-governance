'use strict';
// oo sensor — operator override flag (#1257). Per Phase-0 R&D §2. Binary 0/1.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_FLAG_FILE = path.join(os.homedir(), '.megingjord', 'operator-flags.json');

function compute({ flag } = {}) {
  if (flag === undefined) return { value: 0, evidence: ['no flag set'] };
  return { value: flag === true ? 1 : 0, evidence: [`flag=${flag}`] };
}

function readFlag(file = DEFAULT_FLAG_FILE) {
  try {
    if (!fs.existsSync(file)) return undefined;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed.goal_governance_failing === true;
  } catch { return undefined; }
}

module.exports = { compute, readFlag, DEFAULT_FLAG_FILE };
