// Quota Live — fetch real usage + service cost summary
// Returns normalized { used, limit, percent, cost } objects

async function fetchOpenRouterCredits() {
  try {
    const r = await fetch('/api/openrouter/credits', {
      signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const info = (await r.json()).data || {};
    const used = info.usage ?? 0, limit = info.limit ?? 0;
    return { id: 'openrouter', name: 'OpenRouter Credits',
      used: Math.round(used * 100) / 100,
      limit: limit || '∞', period: 'account',
      percent: limit ? Math.min(100, Math.round((used / limit) * 100)) : 0,
      link: 'https://openrouter.ai/activity' };
  } catch { return null; }
}

async function fetchCloudflareAIUsage() {
  try {
    const r = await fetch('/api/cloudflare/ai-usage', {
      signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { id: 'cloudflare-ai', name: 'Cloudflare AI Neurons',
      used: '—', limit: 10000, percent: 0, period: 'daily',
      note: r.status === 503 ? 'Account ID needed' : 'API error',
      link: 'https://dash.cloudflare.com/' };
    const neurons = (await r.json()).result?.neurons_used ?? 0;
    return { id: 'cloudflare-ai', name: 'Cloudflare AI Neurons',
      used: neurons, limit: 10000, period: 'daily',
      percent: Math.min(100, Math.round((neurons / 10000) * 100)),
      link: 'https://dash.cloudflare.com/' };
  } catch { return null; }
}

function buildServiceCosts() {
  return [
    { id: 'copilot-pro', name: 'GitHub Copilot Pro',
      cost: '$10/mo', detail: '300 premium req/mo',
      link: 'https://github.com/settings/copilot' },
    { id: 'cloudflare', name: 'Cloudflare Workers',
      cost: '$10/mo', detail: 'Pages + Workers AI',
      link: 'https://dash.cloudflare.com/' },
    { id: 'anthropic', name: 'Anthropic (Claude)',
      cost: 'Pay-as-you-go', detail: 'API token usage',
      link: 'https://console.anthropic.com/settings/billing' },
  ];
}

async function fetchAllLiveQuotas() {
  const [or, cf] = await Promise.all([
    fetchOpenRouterCredits(), fetchCloudflareAIUsage() ]);
  return [or, cf].filter(Boolean);
}
