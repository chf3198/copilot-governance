#!/usr/bin/env node
// token-cost-benchmark.js — Token-cost benchmark for harness log schemas.
// Epic #1339 / #1361 / R&D AC3. Compares variants A/B/C across char + JSON
// size (token-count proxy, industry rule: ~4 chars per BPE token for
// GPT-family and Claude).
//
// Variant A: current mixed-schema state (v1 anneal-style events).
// Variant B: unified v3 schema (this Epic's C2 deliverable).
// Variant C: v3 + optional `_summary` field for LLM-friendly synopsis.
'use strict';

const fs = require('fs');
const path = require('path');

const CHARS_PER_TOKEN = 4;
const SAMPLE_SIZE = 1000;

// Synthetic-test-data constants (extracted to satisfy magic-number lint).
const SAMPLE_TS = '2026-05-11T18:00:00.000Z';
const SAMPLE_WINDOW_START = '2026-05-04T18:00:00.000Z';
const SAMPLE_PATTERN = 'recurring-failure-001';
const SAMPLE_TICKET_A = '1234';
const SAMPLE_TICKET_B = '1235';
const SAMPLE_COUNT = 3;
const REPO_BASE = 'https://github.com/chf3198/megingjord-harness/issues';
const SAMPLE_EVIDENCE = [`${REPO_BASE}/${SAMPLE_TICKET_A}`, `${REPO_BASE}/${SAMPLE_TICKET_B}`];

// ─── Variant generators ──────────────────────────────────────────────────────

function genVariantA() {
  // v1 anneal-style fields used by anneal-goal-sensor.js.
  return {
    timestamp: SAMPLE_TS,
    status: 'proposed',
    pattern_id: SAMPLE_PATTERN,
    count: SAMPLE_COUNT,
    window_start: SAMPLE_WINDOW_START,
    evidence: SAMPLE_EVIDENCE,
  };
}

function genVariantB() {
  // Unified v3 (Epic #1339 C2).
  return {
    version: 3,
    ts: SAMPLE_TS,
    service: 'anneal-goal-sensor',
    env: 'local',
    event: 'pattern-detected',
    trace_id: 'trace-abcd',
    session_id: 'session-xyz',
    surface: 'incidents.jsonl',
    tier: 1,
    trigger_role: 'system',
    trigger_type: 'pattern-recurrence',
    pattern_id: SAMPLE_PATTERN,
    severity: 'medium',
    evidence: SAMPLE_EVIDENCE,
  };
}

const SUMMARY_TEXT = `Pattern ${SAMPLE_PATTERN} fired ${SAMPLE_COUNT} times since ${SAMPLE_WINDOW_START.slice(0, 10)} (medium severity, 2 evidence links)`;

function genVariantC() {
  return Object.assign(genVariantB(), { _summary: SUMMARY_TEXT });
}

// ─── Measurement ─────────────────────────────────────────────────────────────

function measureEvent(event) {
  const json = JSON.stringify(event);
  return {
    bytes: Buffer.byteLength(json, 'utf8'),
    chars: json.length,
    tokensProxy: Math.ceil(json.length / CHARS_PER_TOKEN),
  };
}

function measureVariant(generator, sampleSize = SAMPLE_SIZE) {
  let totalBytes = 0, totalChars = 0, totalTokens = 0;
  for (let i = 0; i < sampleSize; i++) {
    const m = measureEvent(generator());
    totalBytes += m.bytes;
    totalChars += m.chars;
    totalTokens += m.tokensProxy;
  }
  return {
    sampleSize,
    perEvent: {
      bytes: totalBytes / sampleSize,
      chars: totalChars / sampleSize,
      tokensProxy: totalTokens / sampleSize,
    },
    total: { bytes: totalBytes, chars: totalChars, tokensProxy: totalTokens },
  };
}

function runBenchmark(sampleSize = SAMPLE_SIZE) {
  const variantA = measureVariant(genVariantA, sampleSize);
  const variantB = measureVariant(genVariantB, sampleSize);
  const variantC = measureVariant(genVariantC, sampleSize);
  const tokensA = variantA.perEvent.tokensProxy;
  const tokensB = variantB.perEvent.tokensProxy;
  const tokensC = variantC.perEvent.tokensProxy;
  return {
    sampleSize, charsPerToken: CHARS_PER_TOKEN,
    variants: { A: variantA, B: variantB, C: variantC },
    deltas: {
      'B vs A (pct)': ((tokensB - tokensA) / tokensA) * 100,
      'C vs B (pct)': ((tokensC - tokensB) / tokensB) * 100,
      'C vs A (pct)': ((tokensC - tokensA) / tokensA) * 100,
    },
  };
}

if (require.main === module) {
  const result = runBenchmark();
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  runBenchmark, measureEvent, measureVariant,
  genVariantA, genVariantB, genVariantC,
  CHARS_PER_TOKEN, SAMPLE_SIZE,
};
