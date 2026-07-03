#!/usr/bin/env node
// tier: 2
// skill-views-derive.js — Wave 8 child 4 (#979).
// Read-only on SKILL.md (per Round-4 D4.1 scope cap). Scans skills/<name>/SKILL.md;
// writes derived views to docs/skills-{agents,copilot}.md. Parent files reference these.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
const VIEW_DIR = path.join(REPO_ROOT, 'docs');
const DESC_TRIM = 200;

const TARGETS = [
  { audience: 'agents', file: path.join(VIEW_DIR, 'skills-agents.md') },
  { audience: 'copilot', file: path.join(VIEW_DIR, 'skills-copilot.md') },
];

function parseSkill(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = { file, name: null, description: null };
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (!kv) continue;
    if (kv[1] === 'name') out.name = kv[2].trim().replace(/^['"]|['"]$/g, '');
    if (kv[1] === 'description') out.description = kv[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function scanSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const out = [];
  for (const dir of fs.readdirSync(SKILLS_DIR)) {
    const skillFile = path.join(SKILLS_DIR, dir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const parsed = parseSkill(skillFile);
    if (parsed && parsed.name) out.push(parsed);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function buildDoc(audience, skills) {
  const header = audience === 'copilot'
    ? '# Skill index — Copilot view\n\n*Auto-generated from `skills/<name>/SKILL.md` frontmatter — DO NOT EDIT.*\n\n'
    : '# Skill index — agents view\n\n*Auto-generated from `skills/<name>/SKILL.md` frontmatter — DO NOT EDIT.*\n\n';
  const rows = skills.map((s) => `- **${s.name}** — ${(s.description || '(no description)').slice(0, DESC_TRIM)}`);
  return header + rows.join('\n') + '\n';
}

function applyToTarget(target, skills) {
  fs.mkdirSync(path.dirname(target.file), { recursive: true });
  const next = buildDoc(target.audience, skills);
  if (fs.existsSync(target.file) && fs.readFileSync(target.file, 'utf8') === next) {
    return { ok: true, file: target.file, changed: false };
  }
  fs.writeFileSync(target.file, next);
  return { ok: true, file: target.file, changed: true };
}

function run(opts = {}) {
  const skills = scanSkills();
  const targets = opts.targets || TARGETS;
  const results = targets.map((t) => applyToTarget(t, skills));
  return { ok: true, skill_count: skills.length, results };
}

if (require.main === module) {
  console.log(JSON.stringify(run(), null, 2));
}

module.exports = { run, scanSkills, buildDoc, parseSkill, TARGETS };
