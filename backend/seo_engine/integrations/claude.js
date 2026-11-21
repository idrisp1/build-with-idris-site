// Claude API access for the content agent (official @anthropic-ai/sdk).
// - Model: claude-opus-5-5 (override with SEO_LLM_MODEL)
// - Structured JSON output via output_config.format (json_schema)
// - Server-side refusal fallbacks enabled ("default" routing)
// - Hard monthly spend cap (SEO_LLM_MONTHLY_BUDGET_USD): checked before every
//   call; usage of every call is recorded to llm-usage.jsonl.
import Anthropic from '@anthropic-ai/sdk';
import { config, secret } from '../config.js';
import { appendJsonl, readJsonl } from '../store.js';

// USD per million tokens (input, output, cache read) for cost accounting.
const PRICES = {
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.1 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01 }
};

export class BudgetExceededError extends Error {}
export class LlmOutputError extends Error {}

export function isConfigured() {
  return Boolean(secret('ANTHROPIC_API_KEY'));
}

export function monthSpendUsd(month = new Date().toISOString().slice(0, 7)) {
  return readJsonl('history/llm-usage.jsonl')
    .filter((u) => String(u.at || '').startsWith(month))
    .reduce((sum, u) => sum + (u.costUsd || 0), 0);
}

function cost(model, usage) {
  const p = PRICES[model] || PRICES['claude-opus-5-5'];
  const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25;
  return (input * p.in + (usage.output_tokens || 0) * p.out + (usage.cache_read_input_tokens || 0) * p.cacheRead) / 1e6;
}

let clientInstance = null;
function client() {
  if (!clientInstance) clientInstance = new Anthropic({ apiKey: secret('ANTHROPIC_API_KEY'), maxRetries: 3, timeout: 10 * 60 * 1000 });
  return clientInstance;
}

// Test seam: lets tests inject a fake client without network access.
export function _setClientForTests(fake) { clientInstance = fake; }

export async function generateJson({ system, user, schema, purpose, maxTokens = 16000, effort = 'high' }) {
  const cfg = config();
  if (!isConfigured() && !clientInstance) throw new Error('ANTHROPIC_API_KEY is not set.');
  const spent = monthSpendUsd();
  if (spent >= cfg.llmMonthlyBudgetUsd) {
    throw new BudgetExceededError(`Monthly LLM budget reached ($${spent.toFixed(2)} of $${cfg.llmMonthlyBudgetUsd}).`);
  }
  const model = cfg.llmModel;
  const response = await client().beta.messages.create({
    model,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: user }]
  });
  const usedModel = response.model || model;
  const usd = cost(usedModel, response.usage || {});
  appendJsonl('history/llm-usage.jsonl', {
    at: new Date().toISOString(), purpose, model: usedModel, stopReason: response.stop_reason,
    inputTokens: response.usage?.input_tokens || 0, outputTokens: response.usage?.output_tokens || 0, costUsd: Number(usd.toFixed(5))
  });
  if (response.stop_reason === 'refusal') throw new LlmOutputError(`Model declined (${response.stop_details?.category || 'unspecified'}).`);
  if (response.stop_reason === 'max_tokens') throw new LlmOutputError('Output truncated at max_tokens.');
  const text = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmOutputError('Model output was not valid JSON.');
  }
}
