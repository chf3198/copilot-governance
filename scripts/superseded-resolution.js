#!/usr/bin/env node
'use strict';
// superseded-resolution (#3525, Epic #3517 T-F6 / ADR-020 §D3) — the closure REASON
// + apply-decision for overtaken-by-events work. Detection is owned by the #3398/#3420
// lane; this is the pure decision function that gates the apply-step with six
// false-positive controls. Surface-only invariant I0: NEVER auto-closes on uncertainty —
// any degraded/ambiguous input fails closed to no-op or contested, never apply-superseded.

const RESOLUTION_LABEL = 'resolution:superseded';
const CONTESTED_LABEL = 'signal:contested-superseded';
const APPEALS_QUEUE = '#2990'; // propose-only review queue (reused, not rebuilt)

const apply = (m) => ({
  action: 'apply-superseded', close: true,
  resolutionLabel: RESOLUTION_LABEL, supersededBy: m,
  bodyLine: `SUPERSEDED_BY: #${m}`, reopenOn: m, // control 4: reversibility
});
const contested = (reason) => ({
  action: 'route-contested', close: false,
  label: CONTESTED_LABEL, queue: APPEALS_QUEUE, reason,
});
const noop = (reason) => ({ action: 'no-op', close: false, reason });

// Cycle detection over the SUPERSEDED_BY edge set plus the proposed target->M edge.
// Any cycle (self-loop, mutual A<->B, or longer) means neither item is truly overtaken.
function createsCycle(edges, from, to) {
  const adj = new Map();
  const add = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  // Tolerate a degraded edge set (I0 fail-closed): ignore non-pair entries rather than throw.
  for (const e of Array.isArray(edges) ? edges : []) {
    if (Array.isArray(e) && e.length === 2) add(e[0], e[1]);
  }
  add(from, to);
  const seen = new Set(), stack = new Set();
  const dfs = (n) => {
    if (stack.has(n)) return true;
    if (seen.has(n)) return false;
    seen.add(n); stack.add(n);
    for (const nx of adj.get(n) || []) if (dfs(nx)) return true;
    stack.delete(n); return false;
  };
  return dfs(from);
}

// input: { target:{number, descendants?:[N]}, verdict:{confirmed:bool, contested?:bool},
//          supersededByRef:{number, exists:bool}|null, edges?:[[from,to]] }
function decideSupersededResolution(input) {
  const item = input && input.target;
  const verdict = input && input.verdict;
  // Fail-closed: malformed/degraded input -> no signal (I0).
  if (!item || typeof item.number !== 'number' || !verdict || typeof verdict.confirmed !== 'boolean') {
    return noop('degraded-input: missing target/verdict — fail closed');
  }
  // Control 5: explicit contest -> appeals path (never auto-close).
  if (verdict.contested === true) return contested('verdict flagged contested by detector/appeal');
  // #3398 verdict not confirmed -> nothing to apply.
  if (verdict.confirmed !== true) return noop('semantic verdict not confirmed');
  // Control 1 + 2: two-signal rule / evidence guard. Apply requires a resolvable
  // SUPERSEDED_BY:#M that actually exists; missing/unresolvable -> contested (never close).
  const ref = input.supersededByRef;
  if (!ref || typeof ref.number !== 'number' || ref.exists !== true) {
    return contested('evidence-guard: SUPERSEDED_BY reference missing or unresolvable');
  }
  const supersededBy = ref.number;
  // Control 3: self-supersession block (#M is the item itself or a descendant).
  const descendants = new Set((item.descendants || []).map(Number));
  if (supersededBy === item.number || descendants.has(supersededBy)) {
    return contested('self-supersession: #M is the item itself or a descendant');
  }
  // Control 6: acyclic/DAG guard — the SUPERSEDED_BY chain must not form a cycle.
  if (createsCycle(input.edges, item.number, supersededBy)) {
    return contested('acyclic-guard: SUPERSEDED_BY chain would form a cycle');
  }
  // All controls pass -> apply superseded reason + close (with reversibility metadata).
  return apply(supersededBy);
}

module.exports = {
  decideSupersededResolution, createsCycle,
  RESOLUTION_LABEL, CONTESTED_LABEL, APPEALS_QUEUE,
};

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => {
    try {
      console.log(JSON.stringify(decideSupersededResolution(JSON.parse(raw || '{}')), null, 2));
    } catch (e) { console.error(`invalid input: ${e.message}`); process.exit(1); }
  });
}
