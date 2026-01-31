import { basePrompt } from "./basePrompt";
import { getRandomBehaviourPrompt } from "./handleRandomAnswers";
import { User } from "../types";
import { getUserPrompt } from "../utils/user/userPrompts/utils/getUserPrompt";
import { retrieveRelevant, retrieveRecent, formatRetrievedForPrompt } from "../vectorDB/retrieve";

export const getCorrectPrompt = async (
  user: User,
  query: string,
  options = { isAskCommand: false }
): Promise<string> => {
  // Retrieve relevant + recent messages from vector DB
  let ragContext = "";
  try {
    const [relevant, recent] = await Promise.all([
      retrieveRelevant(query, user.discordId, 8),
      retrieveRecent(user.discordId, 24, 20),
    ]);
    ragContext = formatRetrievedForPrompt(relevant, recent, user.discordId);
  } catch (error) {
    console.error("[RAG] Failed to retrieve context:", error);
  }

  let prompt = `${basePrompt}\n\n${getUserPrompt(user)}`;

  if (ragContext) {
    prompt += `\n\n${ragContext}`;
  }

  if (options.isAskCommand) {
    prompt += `\n\n${getRandomBehaviourPrompt()}`;
  }

  return prompt;
};