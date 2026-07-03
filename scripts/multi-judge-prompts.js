#!/usr/bin/env node
// multi-judge-prompts (#1814 AC2) — persona prompt library for multi-judge fan-out.
// Loads inventory/rubric-g1-g9-v2.json so each judge sees the G1-G9 boxes upfront.
// Three personas: approving, adversarial, balanced — same rubric, different framing.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RUBRIC_PATH = path.join(__dirname, '..', '..', 'inventory', 'rubric-g1-g9-v2.json');
const PERSONAS = ['approving', 'adversarial', 'balanced'];
const PROMPT_HINT_MAX = 8000;

function loadRubric() {
  return JSON.parse(fs.readFileSync(RUBRIC_PATH, 'utf8'));
}

function rubricToBoxes(rubric) {
  const out = [];
  for (const [goal, goalDef] of Object.entries(rubric.goals || {})) {
    for (const box of (goalDef.boxes || [])) {
      out.push({ goal, title: goalDef.title, id: box.id, check: box.check });
    }
  }
  return out;
}

const FRAMINGS = {
  approving:
    'You are evaluating whether this change PASSES the rubric. Score each box 0.0-1.0; treat ambiguous evidence charitably; default to passing when evidence is plausible.',
  adversarial:
    'You are an adversarial red-team auditor. Find specific reasons each rubric box might FAIL. Score 0.0-1.0; treat ambiguous evidence skeptically; default to failing when evidence is missing or weak.',
  balanced:
    'You are a neutral evaluator. Score each rubric box 0.0-1.0 strictly on evidence presented. No charity, no skepticism — only what the artifact demonstrates.',
};

function buildPrompt(persona, artifact, rubric) {
  if (!PERSONAS.includes(persona)) throw new Error(`unknown persona: ${persona}`);
  const boxes = rubricToBoxes(rubric || loadRubric());
  const boxLines = boxes.map(b => `- ${b.goal}.${b.id} (${b.title}): ${b.check}`).join('\n');
  const trimmed = String(artifact || '').slice(0, PROMPT_HINT_MAX);
  return [
    FRAMINGS[persona],
    '',
    'Rubric (G1-G9 boxes):',
    boxLines,
    '',
    'Artifact under review (trail + diff + closeout, truncated):',
    trimmed,
    '',
    'Respond ONLY with JSON: {"per_goal": {"G1": 0.X, "G2": 0.X, ...}, "rationale": "one sentence per goal"}',
  ].join('\n');
}

module.exports = { buildPrompt, loadRubric, rubricToBoxes, PERSONAS, FRAMINGS,
  RUBRIC_PATH, PROMPT_HINT_MAX };
