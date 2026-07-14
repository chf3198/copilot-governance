// tier: 2
// event-schema-otel-genai.js — OTel GenAI field-level conformance validator.
// Companion to event-schema-v3.js isOtelGenAI (prefix-only detection).
// Provides schema-aware validation per OTel GenAI Semantic Conventions:
// https://opentelemetry.io/docs/specs/semconv/gen-ai/
//
// G3 value: conformant gen_ai.usage.* fields enable Phoenix/Langfuse/Helicone
// to correctly ingest harness telemetry for per-provider cost attribution,
// directly supporting the cost-ascending mandate.
// Refs #1375 / #1339
'use strict';

const OTEL_GENAI_SYSTEMS = [
  'openai', 'anthropic', 'ollama', 'cohere', 'gemini', 'vertex_ai',
  'bedrock', 'other_system', 'aws.sagemaker', 'az.ai_inference',
];

const GENAI_PREFIX = 'gen_ai.';

// P1-5 (#2232): map a wrapper provider id -> a valid OTel gen_ai.system value.
// Providers that are not semconv systems (openrouter/litellm/copilot/groq/cerebras)
// and any unknown provider fall back to the semconv catch-all 'other_system'.
// Return is ALWAYS a member of OTEL_GENAI_SYSTEMS.
function providerToGenAiSystem(provider) {
  return OTEL_GENAI_SYSTEMS.includes(provider) ? provider : 'other_system';
}

function validateUsageField(event, field, errors) {
  const value = event[field];
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    errors.push(`${field} must be a non-negative integer`);
  }
}

function isValidGenAI(event) {
  if (!event || typeof event !== 'object') {
    return { ok: true, errors: [], warnings: ['input not an object'] };
  }
  const keys = Object.keys(event).filter(k => k.startsWith(GENAI_PREFIX));
  if (keys.length === 0) {
    return { ok: true, errors: [], warnings: ['no gen_ai.* fields'] };
  }
  const errors = [];
  if (event['gen_ai.system'] !== undefined &&
      !OTEL_GENAI_SYSTEMS.includes(event['gen_ai.system'])) {
    errors.push(
      `gen_ai.system: unrecognized value "${event['gen_ai.system']}" ` +
      `— not in OTel GenAI canonical enum`
    );
  }
  if (event['gen_ai.request.model'] !== undefined &&
      typeof event['gen_ai.request.model'] !== 'string') {
    errors.push('gen_ai.request.model must be a string');
  }
  validateUsageField(event, 'gen_ai.usage.input_tokens', errors);
  validateUsageField(event, 'gen_ai.usage.output_tokens', errors);
  return { ok: errors.length === 0, errors, warnings: [] };
}

module.exports = { isValidGenAI, OTEL_GENAI_SYSTEMS, GENAI_PREFIX, providerToGenAiSystem };
