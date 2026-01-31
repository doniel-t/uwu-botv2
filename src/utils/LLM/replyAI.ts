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

export type ChannelMessage = {
  authorName: string;
  content: string;
  replyTo?: string; // username of the person they replied to
};

export type ReplyAIContext = {
  instruction: string;
  targetUserId: string;
  targetUsername: string;
  targetMessageContent: string;
  requestingUserId: string;
  channelHistory?: ChannelMessage[];
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

# Reply format
ALWAYS respond in english
UNDER ANY CIRCUMSTANCE KEEP THE MESSAGE SMALLER THAN 2000 CHARACTERS

${targetContext}

# Relevant messages the user has sent about the topic (RAG context)
${ragContext}

${context.channelHistory && context.channelHistory.length > 0 ? `# Recent Channel Chat History (last hour)
The following is the recent conversation in the channel.
This is NOT the user's query — it is background context so you understand what has been discussed.
Unless prompted to dont respond to this. This is ONLY for context and not information for the prompt unless specified.
In this message history you are called UwU Bot v2. Dont reply to your own messages, they are merely here to provide context for user queries and their following answers.

For example if one user named Donel is talking about hardware and another sergej queries about another topic ignore Donels message.
${context.channelHistory.map(m => {
  const replyPart = m.replyTo ? ` (replying to ${m.replyTo})` : "";
  return `[${m.authorName}${replyPart}]: ${m.content}`;
}).join("\n")}
` : ""}

# The message you are responding to
"${context.targetMessageContent}" - sent by ${context.targetUsername}

`;

    const openrouter = createOpenRouter();

    const start = Date.now();
    console.log(`System prompt: ${systemPrompt}`)
    console.log(`Execute the instruction: "${context.instruction}" targeting the message: "${context.targetMessageContent}"`)

    const result = await generateText({
      model: openrouter.chat(CHAT_MODEL),
      system: systemPrompt,
      prompt: `Execute the instruction: "${context.instruction}" targeting the message: "${context.targetMessageContent}"`,
    })
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
        response: result.content.slice(0, 100),
      },
    });

    return result.text
  } catch (error) {
    console.error("[ReplyAI] Error:", error);
    return "I'm having trouble processing that. Try again later.";
  }
}
