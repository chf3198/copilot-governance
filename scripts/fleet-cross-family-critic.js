// tier: 3
// Cross-family generator-critic verification of fleet-authored code with prove-it escalation
// (#2797 P1-4 of Epic #2791; Phase-0 #2792 design D4 / D8-critic). Given a fleet-authored change (pr-diff)
// plus the objective-gate result, dispatch the diff to N DIFFERENT-FAMILY critics (reusing #2041
// dispatchRedTeam / pr-diff artifact), take a MAJORITY panel verdict, and decide mergeability under the
// invariant that the objective gates are AUTHORITATIVE: a critic REJECT with gates PASS is ADVISORY unless
// it asserts a security/correctness flaw not covered by tests — which must be PROVEN with a failing repro
// (re-arm the verifier) or, for a high-severity security pattern it cannot reproduce, escalated one tier;
// never silent-merge. Dispatch, prove-it, escalation and flaw-classification are injected so the safety
// decision tree is pure and the keyword heuristic can be upgraded to a model classifier without a rewrite.
'use strict';

// Heuristic flaw detection (default classifier). It does NOT gate whether a REJECT is investigated — every
// reject is prove-it'd regardless of wording (see decideMergeability), so a real flaw phrased without these
// keywords is still caught when it reproduces. The keyword `flaw` flag only triages a soft PARTIAL (worth a
// prove-it?) and `highSeverity` drives the escalate-when-unprovable path. Both are deliberately BROAD over
// security AND correctness vocabulary — a false positive costs only an extra prove-it that downgrades to
// advisory — and injectable via deps.classifyFlaw for a structured-tag / model upgrade (follow-on #2888).
const FLAW_RE = /\b(security|vuln\w*|inject\w*|traversal|auth|secret|rce|xss|sqli|ssrf|csrf|overflow|race|deadlock|data[- ]?loss|leak|deserial\w*|prototype|gadget|unsafe|incorrect|invalid|inconsistent|missing|wrong|broken?|crash\w*|null|undefined|off[- ]by[- ]one|regress\w*|corrupt\w*|bypass|exploit|correctness)\b/i;
const HIGH_SEV_RE = /\b(critical|high[- ]?sever\w*|rce|remote[- ]code|inject\w*|traversal|auth[- ]?bypass|privilege|secret[- ]?exposure|data[- ]?(loss|corrupt\w*)|inconsistent[- ]?state|deadlock|exploit)\b/i;

function defaultClassify(text) { return { flaw: FLAW_RE.test(text), highSeverity: HIGH_SEV_RE.test(text) }; }

// Classify one critic finding line: verdict (accept/partial/reject) + whether it asserts a
// security/correctness flaw + whether it reads as high-severity. Classifier is injectable.
function classifyFinding(finding, classify = defaultClassify) {
  const text = (finding && finding.raw) || '';
  const verdict = /reject/i.test(text) ? 'reject' : /partial/i.test(text) ? 'partial' : 'accept';
  return { verdict, ...classify(text), raw: text };
}

// A critic's stance = the worst of its findings (reject > partial > accept).
function criticStance(findings, classify = defaultClassify) {
  const classified = (findings || []).map((finding) => classifyFinding(finding, classify));
  const stance = classified.some((item) => item.verdict === 'reject') ? 'reject'
    : classified.some((item) => item.verdict === 'partial') ? 'partial' : 'accept';
  return { stance, findings: classified };
}

// Panel majority across critics. AC4: an exact tie for first place (no strict plurality winner) ALWAYS
// escalates one tier — deliberately, since a split panel on AI-authored code warrants a senior look.
function panelVerdict(stances) {
  const tally = stances.reduce((acc, stance) => { acc[stance] = (acc[stance] || 0) + 1; return acc; },
    Object.create(null));
  const ranked = Object.keys(tally).sort((left, right) => tally[right] - tally[left]);
  const tie = ranked.length > 1 && tally[ranked[1]] === tally[ranked[0]];
  return { verdict: tie ? 'escalate' : ranked[0], tie, tally };
}

// AC3 prove-it: prove EVERY flagged finding (no early return — a low-sev reproducible one must never mask a
// high-sev unprovable one). Returns the reproduced set + the unprovable high-severity set.
async function proveFlagged(flagged, deps) {
  const reproduced = [];
  const highSevUnproven = [];
  for (const finding of flagged) {
    const proof = deps.proveIt ? await deps.proveIt(finding) : { reproduced: false };
    if (proof && proof.reproduced) reproduced.push({ finding, test: proof.test });
    else if (finding.highSeverity) highSevUnproven.push(finding);
  }
  return { reproduced, highSevUnproven };
}

// AC2/AC3 decision. gatesPass = objective-gate verdict (authoritative). critics = [{stance, findings}].
// deps.proveIt(finding) -> {reproduced, test} | {reproduced:false}. deps.escalate(reason, findings).
async function decideMergeability({ gatesPass, panel, critics, deps = {} }) {
  if (!gatesPass) return { decision: 'block', reason: 'objective-gate-failed' }; // never silent-merge
  // SAFETY-FIRST (F4): scan EVERY critic's findings BEFORE honoring a panel-accept majority — a single
  // dissenting critic's flaw must outrank a less-capable majority's 'accept'. A REJECT is a strong enough
  // signal to ALWAYS prove-it, keyword-independent (closes the semantic-gap silent-merge: a real flaw
  // phrased without flaw-vocabulary still gets caught when it reproduces); a soft PARTIAL is prove-it'd only
  // when its wording reads as a flaw (avoids routing every "mostly fine" nit through prove-it).
  const flagged = critics.flatMap((critic) => critic.findings)
    .filter((finding) => finding.verdict === 'reject' || (finding.verdict === 'partial' && finding.flaw));
  if (flagged.length) {
    const { reproduced, highSevUnproven } = await proveFlagged(flagged, deps);
    // Precedence: an unprovable high-severity flaw needs human eyes and OUTRANKS an automatable re-arm;
    // a proven flaw outranks an unproven low-sev one; else the objective gates stay authoritative.
    if (highSevUnproven.length) { // F5: hand the FULL set to the escalation sink, not just the first
      return { decision: 'escalate', reason: 'high-sev-security-unprovable', findings: highSevUnproven,
        reproduced, escalation: deps.escalate ? await deps.escalate('high-sev-unreproduced-security', highSevUnproven) : null };
    }
    if (reproduced.length) return { decision: 're-arm', reason: 'flaw-reproduced', repros: reproduced.map((item) => item.test), reproduced };
    return { decision: 'advisory', reason: 'gates-authoritative-unproven-findings', flagged: flagged.length };
  }
  // No flagged flaw: the panel majority decides (AC4 tie escalates; non-security reject/partial → advisory).
  if (panel.verdict === 'escalate') {
    return { decision: 'escalate', reason: 'panel-tie-one-tier',
      escalation: deps.escalate ? await deps.escalate('panel-tie', null) : null };
  }
  if (panel.verdict === 'accept') return { decision: 'merge', reason: 'gates-pass-panel-accept' };
  return { decision: 'advisory', reason: 'gates-authoritative-no-security-flaw' };
}

// AC1 + AC4 orchestrator. criticModels: [{model, family}] — each MUST be cross-family vs generatorFamily.
// deps.dispatch({artifactType, content, model}) -> { findings, modelUsed }. deps.classifyFlaw is threaded.
async function runCriticPanel({ content, gatesPass, generatorFamily, criticModels = [], deps = {} }) {
  const classify = deps.classifyFlaw || defaultClassify;
  const used = [];
  const critics = [];
  for (const candidate of criticModels) {
    if (candidate.family && generatorFamily && candidate.family === generatorFamily) continue; // AC1
    const result = await deps.dispatch({ artifactType: 'pr-diff', content, model: candidate.model });
    used.push(result.modelUsed || candidate.model);
    critics.push(criticStance(result.findings || [], classify));
  }
  if (critics.length === 0) return { decision: 'escalate', reason: 'no-cross-family-critic-available' };
  const panel = panelVerdict(critics.map((critic) => critic.stance));
  const out = await decideMergeability({ gatesPass, panel, critics, deps });
  return { ...out, panel, critics: used };
}

module.exports = {
  classifyFinding, criticStance, panelVerdict, decideMergeability, runCriticPanel,
  defaultClassify, FLAW_RE, HIGH_SEV_RE,
};
