import { getDB } from "../src/utils/LLM/vectorDB/db";
import { retrieveRelevant, retrieveRecent, formatRetrievedForPrompt } from "../src/utils/LLM/vectorDB/retrieve";

async function main() {
  const query = "what is my take on frieren";
  const userId = "222398053703876628";

  console.log(`\n=== RAG Test ===`);
  console.log(`Query: "${query}"`);
  console.log(`User ID: ${userId}\n`);

  // Ensure DB is initialized
  getDB();

  const [relevant, recent] = await Promise.all([
    retrieveRelevant(query, userId, 8),
    retrieveRecent(userId, 24, 20),
  ]);

  console.log(`\n--- Relevant: ${relevant.length} results ---`);
  for (const msg of relevant) {
    console.log(`  [${msg.userName}] ${msg.content.slice(0, 100)}`);
    console.log(`    history IDs: ${msg.history.length}, replyTo: ${msg.replyMessageId ?? "none"}`);
  }

  console.log(`\n--- Recent: ${recent.length} results ---`);
  for (const msg of recent) {
    const time = new Date(msg.createdAt).toLocaleTimeString();
    console.log(`  [${time}] ${msg.userName}: ${msg.content.slice(0, 100)}`);
  }

  const formatted = formatRetrievedForPrompt(relevant, recent, userId);
  console.log(`\n--- Formatted prompt context ---`);
  console.log(formatted || "(empty)");
}

main().catch(console.error);
