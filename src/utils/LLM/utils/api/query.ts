import { generateText } from "ai";
import { getCorrectPrompt } from "../../prompts/getCorrectPrompt";
import { User } from "../../types";
import { getUserContext } from "../../prompts/getUserContext";
import { createOpenRouter, CHAT_MODEL, computeCost, logAPICall } from "./openrouter";

// Global rate limiting
let globalRequestCount = 0;
let lastResetTime = Date.now();
const RATE_LIMIT = 1000;
const HOUR_IN_MS = 60 * 60 * 1000;

const checkRateLimit = (): string | null => {
  const now = Date.now();
  if (now - lastResetTime >= HOUR_IN_MS) {
    globalRequestCount = 0;
    lastResetTime = now;
  }
  if (globalRequestCount >= RATE_LIMIT) {
    return "Rate Limit, try in an hour";
  }
  globalRequestCount++;
  return null;
};

export const query = async (prompt: string, user: User) => {
  const rateLimitError = checkRateLimit();
  if (rateLimitError) {
    return rateLimitError;
  }

  const openrouter = createOpenRouter();

  const userContext = getUserContext(prompt);
  const usedPrompt = `${prompt}\n\n${userContext}`;

  const systemPrompt = await getCorrectPrompt(user, prompt, { isAskCommand: true });

  const start = Date.now();
  const result = await generateText({
    model: openrouter(CHAT_MODEL),
    system: systemPrompt,
    prompt: usedPrompt,
  });
  const durationMs = Date.now() - start;

  const inputTokens = result.usage.inputTokens || 0;
  const outputTokens = result.usage.outputTokens || 0;
  const cost = computeCost(CHAT_MODEL, inputTokens, outputTokens);

  logAPICall({
    type: "AskAI",
    model: CHAT_MODEL,
    inputTokens,
    outputTokens,
    cost: cost.toFixed(6),
    durationMs,
    extra: { user: user.name, prompt: usedPrompt.slice(0, 100), response: result.text.slice(0, 100) },
  });

  return result.text;
};
