import { getUserById } from "./utils/user/users";
import { generateText } from "ai";
import { basePrompt } from "./prompts/basePrompt";
import { getUserPrompt } from "./utils/user/userPrompts/utils/getUserPrompt";
import { getRandomInfo } from "./utils/user/userPrompts/utils/getRandomInfo";
import { retrieveRelevant, formatRetrievedForPrompt, retrieveRecent } from "./vectorDB/retrieve";
import { createOpenRouter, CHAT_MODEL, computeCost, logAPICall } from "./utils/api/openrouter";

// Rate limiting (shared with main query)
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

export type ReplyAIContext = {
  instruction: string;
  targetUserId: string;
  targetUsername: string;
  targetMessageContent: string;
  requestingUserId: string;
};

export async function getReplyAIResponse(context: ReplyAIContext): Promise<string> {
  try {
    const rateLimitError = checkRateLimit();
    if (rateLimitError) {
      return rateLimitError;
    }

    const targetUser = getUserById(context.targetUserId);

    // Build context about the target
    let targetContext = "";
    if (targetUser) {
      targetContext = `
# Information about the target user (the person being targeted)
${getUserPrompt(targetUser)}

## Additional facts about ${targetUser.name}:
${getRandomInfo(targetUser.userInformation).join("\n")}
`;
    } else {
      targetContext = `
# Information about the target user
- Username: ${context.targetUsername}
- No additional information available about this user
`;
    }

    // Retrieve RAG context for the target user
    let ragContext = "";
    try {
      const [relevant, recent] = await Promise.all([
        retrieveRelevant(context.instruction + " " + context.targetMessageContent, context.targetUserId, 6),
        retrieveRecent(context.targetUserId, 24, 10),
      ]);
      ragContext = formatRetrievedForPrompt(relevant, recent);
    } catch (error) {
      console.error("[ReplyAI] RAG retrieval failed:", error);
    }

    const systemPrompt = `
${basePrompt}

# Special Context - Reply Command
You have been summoned by a user to respond to another user's message.
The user who summoned you wants you to: "${context.instruction}"

${targetContext}

${ragContext}

# The message you are responding to
"${context.targetMessageContent}" - sent by ${context.targetUsername}

# Your Task
Follow the instruction given by the user who summoned you. Be creative and use any information you have about the target.
If the instruction is to roast/insult, go all out with the information you have.
If you don't have information about the target, use their message content and username to craft your response.

# Rules
- Keep your response to 1-3 sentences max
- Be savage if that's what was requested
- Reference the actual message content when relevant
- Use any user information you have to make it personal
`;

    const openrouter = createOpenRouter();

    const start = Date.now();
    const result = await generateText({
      model: openrouter(CHAT_MODEL),
      system: systemPrompt,
      prompt: `Execute the instruction: "${context.instruction}" targeting the message: "${context.targetMessageContent}"`,
    });
    const durationMs = Date.now() - start;

    const inputTokens = result.usage.inputTokens || 0;
    const outputTokens = result.usage.outputTokens || 0;
    const cost = computeCost(CHAT_MODEL, inputTokens, outputTokens);

    logAPICall({
      type: "ReplyAI",
      model: CHAT_MODEL,
      inputTokens,
      outputTokens,
      cost: cost.toFixed(6),
      durationMs,
      extra: {
        instruction: context.instruction,
        targetUser: targetUser?.name || context.targetUsername,
        response: result.text.slice(0, 100),
      },
    });

    return result.text;
  } catch (error) {
    console.error("[ReplyAI] Error:", error);
    return "I'm having trouble processing that. Try again later.";
  }
}
