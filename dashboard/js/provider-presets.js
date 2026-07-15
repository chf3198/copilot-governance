// Provider Presets — auto-fill config for known LLM providers
// Each preset: {label, tier, apiFormat, healthEndpoint, modelsEndpoint, authType, baseUrl}
const _p = (l,t,f,h,m,a,u,o)=>({label:l,tier:t,apiFormat:f,healthEndpoint:h,modelsEndpoint:m,authType:a,baseUrl:u,...o});
const _oc = 'openai-compat', _v1 = '/v1/models';
const PROVIDER_PRESETS = {
  ollama: _p('Ollama','local',_oc,'/api/tags','/api/tags','none','http://localhost:11434',{defaultPort:11434}),
  'lm-studio': _p('LM Studio','local',_oc,_v1,_v1,'none','http://localhost:1234',{defaultPort:1234}),
  llamafile: _p('llamafile','local',_oc,_v1,_v1,'none','http://localhost:8080',{defaultPort:8080}),
  vllm: _p('vLLM','local',_oc,_v1,_v1,'none','http://localhost:8000',{defaultPort:8000}),
  localai: _p('LocalAI','local',_oc,_v1,_v1,'none','http://localhost:8080',{defaultPort:8080}),
  litellm: _p('LiteLLM Proxy','local',_oc,'/health/liveliness',_v1,'none','http://localhost:4000',{defaultPort:4000}),
  openrouter: _p('OpenRouter','cloud',_oc,'/api/v1/models','/api/v1/models','bearer','https://openrouter.ai/api/v1'),
  openai: _p('OpenAI','cloud',_oc,_v1,_v1,'bearer','https://api.openai.com/v1'),
  anthropic: _p('Anthropic','cloud','anthropic',_v1,_v1,'header','https://api.anthropic.com/v1',{authHeaderName:'x-api-key'}),
  groq: _p('Groq','cloud',_oc,'/openai/v1/models','/openai/v1/models','bearer','https://api.groq.com/openai/v1'),
  deepseek: _p('DeepSeek','cloud',_oc,_v1,_v1,'bearer','https://api.deepseek.com/v1'),
  mistral: _p('Mistral AI','cloud',_oc,_v1,_v1,'bearer','https://api.mistral.ai/v1'),
  'google-ai': _p('Google AI Studio','cloud','google','/v1beta/models','/v1beta/models','query-param','https://generativelanguage.googleapis.com',{authLabel:'API Secret',authPlaceholder:'AIza...'}),
  together: _p('Together AI','cloud',_oc,_v1,_v1,'bearer','https://api.together.xyz/v1'),
  fireworks: _p('Fireworks AI','cloud',_oc,'/inference/v1/models','/inference/v1/models','bearer','https://api.fireworks.ai/inference/v1'),
  cerebras: _p('Cerebras','cloud',_oc,_v1,_v1,'bearer','https://api.cerebras.ai/v1'),
  custom: _p('Custom Endpoint','custom',_oc,_v1,_v1,'bearer','')
};

function getProviderPreset(providerId) {
  return PROVIDER_PRESETS[providerId] || PROVIDER_PRESETS.custom;
}

function listProviderPresets() {
  return Object.entries(PROVIDER_PRESETS).map(([id, p]) => ({
    id, label: p.label, tier: p.tier
  }));
}
if(typeof module!=="undefined")module.exports={PROVIDER_PRESETS,getProviderPreset,listProviderPresets};else Object.assign(window,{PROVIDER_PRESETS,getProviderPreset,listProviderPresets});
