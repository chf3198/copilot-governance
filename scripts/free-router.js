// tier: 4
// Phase 4 / #786 — free-model orchestrator MVP
// Classifier+signal stack picks dispatch tier. Calls free LLM (Groq) when
// available; falls back to deterministic cascade-dispatch logic otherwise.
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before any credential read (canonical shim)
const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(process.cwd(), '.dashboard', 'capabilities.json');
const FREE_LLM_TIMEOUT_MS = 8000;
const TASK_TEXT_TRUNC_CHARS = 500;
const SIGNAL_FIM = /\b(complete|completion|fim|fill-in|autocomplete)\b/i;
const SIGNAL_REFACTOR = /\b(refactor|rename|extract|inline|move)\b/i;
const SIGNAL_REASONING = /\b(architect|design|trade-?off|security|audit|debug|investigate)\b/i;
const SIGNAL_DOCS = /\b(docs?|readme|comment|describe|explain)\b/i;

const TIERS = {
  FIM: { tier: 'fleet-fim', model: 'starcoder2:3b', host: '36gbwinresource' },
  REFACTOR: { tier: 'fleet-coder', model: 'qwen2.5-coder:7b', host: '36gbwinresource' },
  REASONING: { tier: 'premium', model: 'frontier-reasoning', host: 'provider-adapter' },
  DOCS: { tier: 'free-cloud', model: 'groq-llama-3.3-70b', host: 'cloud' },
  DEFAULT: { tier: 'haiku', model: 'balanced-cloud', host: 'provider-adapter' },
};

function _capability() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch { return null; }
}

function _hasFreeLLM(cap) {
  if (!cap?.providers) return false;
  return ['groq', 'cerebras', 'google_ai_studio'].some(p => cap.providers[p]?.available);
}

function classify(taskText) {
  if (SIGNAL_FIM.test(taskText)) return TIERS.FIM;
  if (SIGNAL_REFACTOR.test(taskText)) return TIERS.REFACTOR;
  if (SIGNAL_REASONING.test(taskText)) return TIERS.REASONING;
  if (SIGNAL_DOCS.test(taskText)) return TIERS.DOCS;
  return TIERS.DEFAULT;
}

async function _askFreeLLM(taskText, signalGuess) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FREE_LLM_TIMEOUT_MS);
  try {
    const prompt = `Task: ${taskText.slice(0, TASK_TEXT_TRUNC_CHARS)}\n\nSignal-stack guess: ${signalGuess.tier}.\nPick best tier from: fleet-fim, fleet-coder, free-cloud, haiku, premium. Reply ONE word.`;
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10, temperature: 0,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.choices?.[0]?.message?.content || '').trim().toLowerCase();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function route(taskText) {
  const signalGuess = classify(taskText);
  const cap = _capability();
  if (!_hasFreeLLM(cap)) {
    return { ...signalGuess, source: 'classifier-only', reason: 'no-free-llm' };
  }
  const llmTier = await _askFreeLLM(taskText, signalGuess);
  if (!llmTier) return { ...signalGuess, source: 'classifier-only', reason: 'llm-fallback' };
  const matched = Object.values(TIERS).find(t => t.tier === llmTier);
  if (matched) return { ...matched, source: 'free-llm' };
  return { ...signalGuess, source: 'classifier-only', reason: 'llm-unparseable' };
}

module.exports = { classify, route, TIERS, _capability, _hasFreeLLM };

if (require.main === module) {
  const task = process.argv.slice(2).join(' ');
  if (!task) { process.stderr.write('Usage: free-router.js <task description>\n'); process.exit(1); }
  route(task).then(r => process.stdout.write(JSON.stringify(r, null, 2) + '\n'));
}
