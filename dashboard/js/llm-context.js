// LLM Context — Context window size comparison across fleet models
// Renders horizontal bar chart comparing all available models

const LLM_MODELS = [
  { name: 'GPT-4.1', ctx: 1000000, tier: 'cloud', mult: 0 },
  { name: 'Gemini 2.5 Pro', ctx: 1000000, tier: 'cloud', mult: 1 },
  { name: 'Gemini 3 Flash', ctx: 1000000, tier: 'cloud', mult: 0.33 },
  { name: 'Claude Opus 4.6', ctx: 200000, tier: 'cloud', mult: 3 },
  { name: 'Claude Sonnet 4.6', ctx: 200000, tier: 'cloud', mult: 1 },
  { name: 'Claude Haiku 4.5', ctx: 200000, tier: 'cloud', mult: 0.33 },
  { name: 'GPT-5.2', ctx: 128000, tier: 'cloud', mult: 1 },
  { name: 'GPT-5 mini', ctx: 128000, tier: 'cloud', mult: 0 },
  { name: 'Grok Code Fast 1', ctx: 128000, tier: 'cloud', mult: 0.25 },
  { name: 'qwen2.5:7b', ctx: 128000, tier: 'local', device: 'fleet-host' },
  { name: 'mistral:latest', ctx: 32000, tier: 'local', device: 'fleet-host' },
  { name: 'qwen3.5:0.8b', ctx: 32000, tier: 'local', device: 'dev-2' },
  { name: 'phi3:mini', ctx: 4000, tier: 'local', device: 'fleet-host' },
  { name: 'gemma3:270m', ctx: 8000, tier: 'local', device: 'dev-2' },
  { name: 'tinyllama', ctx: 2048, tier: 'local', device: 'dev-2' },
];

function renderLLMContext() {
  const maxCtx = Math.max(...LLM_MODELS.map(m => m.ctx));
  const rows = LLM_MODELS.map(m => {
    const pct = Math.max(1, (m.ctx / maxCtx) * 100);
    const cls = m.tier === 'cloud' ? 'ctx-cloud' : 'ctx-local';
    const label = m.ctx >= 1000000
      ? (m.ctx / 1000000) + 'M'
      : (m.ctx / 1000) + 'K';
    const extra = m.mult != null
      ? `<span class="ctx-mult">${m.mult}x</span>` : '';
    const dev = m.device
      ? `<span class="ctx-dev">${esc(m.device)}</span>` : '';
    return `<div class="ctx-row">
      <span class="ctx-name">${esc(m.name)}${dev}</span>
      <div class="ctx-bar-wrap">
        <div class="ctx-bar ${cls}" style="width:${pct}%"></div>
        <span class="ctx-val">${label}</span>
      </div>${extra}</div>`;
  }).join('');

  return `<div class="ctx-chart">
    <div class="ctx-header">
      <span class="ctx-cloud-dot"></span> Cloud (Copilot Pro)
      <span class="ctx-local-dot"></span> Local (Ollama)
    </div>${rows}</div>`;
}
