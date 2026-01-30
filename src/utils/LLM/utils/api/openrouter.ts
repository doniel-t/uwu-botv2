import { createOpenRouter as openRouterClient } from '@openrouter/ai-sdk-provider';

export const CHAT_MODEL = "google/gemini-3-flash-preview";
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function getOpenRouterKey(): string {
  return process.env.OPENROUTER_API_KEY || "";
}

export function createOpenRouter() {
  return openRouterClient({
    apiKey: getOpenRouterKey(),
  });
}

// Cached pricing data: model id -> { input, output } per token
type ModelPricing = { input: number; output: number };
const pricingCache = new Map<string, ModelPricing>();
let pricingFetched = false;

async function fetchPricing(): Promise<void> {
  if (pricingFetched) return;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${getOpenRouterKey()}` },
    });

    if (!response.ok) {
      console.warn("[OpenRouter] Failed to fetch model pricing:", response.status);
      return;
    }

    const data = (await response.json()) as {
      data: {
        id: string;
        pricing: { prompt: string; completion: string };
      }[];
    };

    for (const model of data.data) {
      pricingCache.set(model.id, {
        input: parseFloat(model.pricing.prompt),
        output: parseFloat(model.pricing.completion),
      });
    }

    pricingFetched = true;
    console.log(`[OpenRouter] Loaded pricing for ${pricingCache.size} models`);
  } catch (error) {
    console.warn("[OpenRouter] Error fetching pricing:", error);
  }
}

function getPricing(modelId: string): ModelPricing {
  return pricingCache.get(modelId) || { input: 0, output: 0 };
}

export function computeCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = getPricing(modelId);
  // OpenRouter pricing is per-token
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

export type LogEntry = {
  type: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: string;
  durationMs: number;
  [key: string]: unknown;
};

export function logAPICall(entry: LogEntry): void {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] [${entry.type}] model=${entry.model} in=${entry.inputTokens} out=${entry.outputTokens} cost=$${entry.cost} duration=${entry.durationMs}ms`,
    entry.extra ? entry.extra : ""
  );
}

// Call on startup to warm the pricing cache
export async function initPricing(): Promise<void> {
  await fetchPricing();
}
