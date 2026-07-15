// Action handlers for the fleet agentic loop (#2854 P1-0 child of #2802; design D12). One fleet action →
// { record, failed, done? } where `done` short-circuits the loop. Dependency-injected (deps.invokeTool /
// deps.validate) so the driver stays thin and these stay unit-testable. Untrusted model strings + tool
// payloads are capped before entering the transcript (anti-bloat, G6); a misbehaving dep or a
// non-serializable result is treated as a FAILURE, never a crash.
const MAX_REASON_CHARS = 200; // cap untrusted model strings (escalate reason) recorded in the transcript
const MAX_RESULT_CHARS = 4000; // cap a tool-result payload recorded in the transcript
// Coerce to string FIRST so a non-string (a model passing a huge object/array as tool/reason) can't
// bypass the bound; then truncate. Always returns a bounded string.
const cap = (text) => {
  const str = String(text ?? '');
  return str.length > MAX_REASON_CHARS ? str.slice(0, MAX_REASON_CHARS) + '…' : str;
};

// Bound a tool result payload → { value, truncated }. Over-budget OR non-serializable (circular refs /
// BigInt make JSON.stringify throw) becomes a flagged string, so a huge/garbage payload can neither bloat
// the transcript (functional DoS) nor crash the loop.
function capResult(payload) {
  if (payload == null) return { value: payload, truncated: false };
  let serialized;
  try { serialized = JSON.stringify(payload); }
  catch { return { value: '[unserializable tool result]', truncated: true }; }
  if (serialized == null || serialized.length <= MAX_RESULT_CHARS) return { value: payload, truncated: false };
  return { value: serialized.slice(0, MAX_RESULT_CHARS) + '…', truncated: true };
}

// Governed tool call → deps.invokeTool (OA2-gated, #2847). null-safe: a misbehaving dep is a failure, not
// a crash. Payload capped + placed FLAT at record.result (ok + truncated at top level — no double-nesting).
function handleTool(action, deps) {
  const result = deps.invokeTool(action.tool, action.args || {});
  const ok = Boolean(result && result.ok);
  const capped = capResult(result && result.result);
  // cap(action.tool): the tool name is an untrusted model string entering the transcript — bound it too.
  return { record: { kind: 'tool', tool: cap(action.tool), ok, result: capped.value, truncated: capped.truncated }, failed: !ok };
}

// Proposed change → validate in the fail-closed sandbox (deps.validate, #2844). Only a trusted change
// completes; null-safe vs a misbehaving validate. The OPERATOR owns testCommand (passed in, not the action).
function handlePropose(action, deps, testCommand) {
  const verdict = deps.validate({ changes: action.changes, testCommand, root: deps.root });
  const trusted = Boolean(verdict && verdict.trusted);
  const done = trusted ? { outcome: 'completed', reason: 'change-trusted', result: action.changes } : null;
  // cap the verdict reason too — the last dep-derived string entering the transcript (anti-bloat, G6).
  return { record: { kind: 'propose', trusted, reason: cap(verdict && verdict.reason) }, failed: !trusted, done };
}

// applyAction(action, deps, testCommand) -> { record, failed, done? }. Dispatches one fleet action; an
// unknown/garbage action shape is a recorded failure (records only typeof, not the raw untrusted body).
function applyAction(action, deps, testCommand) {
  switch (action && action.type) {
    case 'tool': return handleTool(action, deps);
    case 'propose': return handlePropose(action, deps, testCommand);
    case 'final':
      // cap the untrusted free-form answer returned to the caller (DoS guard). NOTE: a `propose` result
      // (action.changes) is NOT capped — it is the deliverable and is already bounded to <=10MB by the
      // #2844 validator that just trusted it; truncating it would corrupt the change the operator applies.
      return { record: { kind: 'final' }, failed: false,
        done: { outcome: 'completed', reason: 'final', result: capResult(action.answer).value } };
    case 'escalate': {
      const reason = action.reason ? cap(action.reason) : 'fleet-escalate';
      return { record: { kind: 'escalate', reason }, failed: false, done: { outcome: 'escalated', reason } };
    }
    default:
      return { record: { kind: 'invalid', type: typeof action }, failed: true };
  }
}

module.exports = { applyAction, capResult, cap };
