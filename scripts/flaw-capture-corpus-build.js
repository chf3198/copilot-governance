#!/usr/bin/env node
'use strict';
// flaw-capture-corpus-build — builds the labelled replay-eval corpus for Epic #3425 P1-g per the
// #3426 AC-R6 methodology. Deterministic (no Date/random) so the fixture is reproducible.
//
// Methodology encoded here (AC-R6):
//   - SOURCE POPULATION: every historical review-point recoverable from incidents.jsonl,
//     baton-builds.jsonl, session-bypass-tracker rows, and the closed-ticket baton-artifact trail —
//     NOT only recent high-visibility misses. (The live extractor reads those surfaces; this seed
//     encodes the SHAPE + the two known-positive #3424 F6 seeds so the eval is exercisable today.)
//   - LABELLING (hybrid two-stage): an automated pre-tag (`label_source: auto`) from objective
//     downstream signals — a follow-on ticket was filed, a revert/amend followed, a gate later failed
//     for the same cause — plus a Consultant adjudication pass (`label_source: consultant`) on the
//     low-confidence subset. Each entry records its label_source.
//   - STRATIFICATION: across F1-F8 (oversampling rare F2/F5/F6) and across roles. This SEED is below
//     the >=200 / >=15-per-class / >=30-per-role floors ON PURPOSE — so flaw-capture-replay-eval keeps
//     the system ADVISORY until the corpus is populated from real history (the honest shipping state).
//
// Entry shape: { id, friction_class, role, surfaced, is_real_flaw, confidence?, label_source, source }

const ROLES = ['manager', 'collaborator', 'admin', 'consultant'];
const SOURCES = ['incidents.jsonl', 'baton-builds.jsonl', 'session-bypass-tracker', 'closed-ticket-trail'];
// per-class seed size (deliberately small / below the 15-floor; F2/F5/F6 are the rare oversample targets)
const SEED_PER_CLASS = { F1: 9, F2: 6, F3: 9, F4: 8, F5: 6, F6: 6, F7: 8, F8: 7 };

// A deterministic real/not + surfaced pattern per index (encodes a realistic ~0.8 precision seed).
function label(index) {
  const surfaced = index % 5 !== 4;          // ~80% surfaced
  const isReal = surfaced && index % 5 !== 3; // of surfaced, ~75% are real flaws
  return { surfaced, is_real_flaw: isReal };
}

function build() {
  const corpus = [];
  // The two known-positive F6 seeds from the F6-origin ticket (worktree-residual + squash-equivalence
  // false-positive). SEED_TICKET names it so the id carries no bare magic number.
  const SEED_TICKET = 'ticket3424';
  corpus.push({ id: `F6-${SEED_TICKET}-worktree-residual`, friction_class: 'F6', role: 'consultant',
    surfaced: true, is_real_flaw: true, confidence: 'high', label_source: 'consultant', source: 'closed-ticket-trail' });
  corpus.push({ id: `F6-${SEED_TICKET}-squash-equivalence`, friction_class: 'F6', role: 'consultant',
    surfaced: true, is_real_flaw: true, confidence: 'high', label_source: 'consultant', source: 'closed-ticket-trail' });
  for (const [cls, count] of Object.entries(SEED_PER_CLASS)) {
    for (let i = 0; i < count; i++) {
      const { surfaced, is_real_flaw } = label(i);
      const entry = { id: `${cls}-seed-${i}`, friction_class: cls, role: ROLES[i % ROLES.length],
        surfaced, is_real_flaw, label_source: i % 3 === 0 ? 'consultant' : 'auto', source: SOURCES[i % SOURCES.length] };
      if (cls === 'F6') entry.confidence = i % 2 === 0 ? 'high' : 'medium'; // F6 carries a probe confidence
      corpus.push(entry);
    }
  }
  return corpus;
}

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const out = path.join(__dirname, '..', '..', 'tests', 'eval', 'flaw-capture-corpus.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(build(), null, 2) + '\n');
  process.stdout.write(`wrote ${build().length} labelled review-points to ${out}\n`);
}

module.exports = { build, SEED_PER_CLASS, ROLES };
