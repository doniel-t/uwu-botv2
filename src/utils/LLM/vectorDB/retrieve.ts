import { getDB } from "./db";
import { embedText } from "./embed";
import { ContextMessage } from "./ingest";

export type RetrievedMessage = {
  content: string;
  userName: string;
  userId: string;
  contextWindow: ContextMessage[];
  createdAt: number;
};

export async function retrieveRelevant(
  query: string,
  userId: string,
  limit: number = 8
): Promise<RetrievedMessage[]> {
  const db = getDB();

  try {
    const queryEmbedding = await embedText(query);

    // Fetch a large candidate pool to maximize recall after user filtering.
    const candidateLimit = limit * 10;

    const rows = db
      .prepare(
        `
      SELECT
        m.content,
        m.user_name,
        m.user_id,
        m.context_window,
        m.created_at,
        e.distance
      FROM (
        SELECT message_id, distance
        FROM message_embeddings
        WHERE embedding MATCH ?
          AND k = ?
      ) e
      INNER JOIN messages m ON m.id = e.message_id
      WHERE m.user_id = ?
      ORDER BY e.distance
      LIMIT ?
    `
      )
      .all(
        new Float32Array(queryEmbedding),
        candidateLimit,
        userId,
        limit
      ) as {
      content: string;
      user_name: string;
      user_id: string;
      context_window: string;
      created_at: number;
      distance: number;
    }[];

    if (rows.length > 0) {
      console.log(`[VectorDB] Found ${rows.length} relevant messages for user ${userId}:`);
      for (const row of rows) {
        console.log(`  [dist=${row.distance.toFixed(4)}] ${row.user_name}: ${row.content.slice(0, 80)}`);
      }
    } else {
      console.log(`[VectorDB] No relevant messages found for user ${userId} (query: "${query.slice(0, 60)}")`);
    }

    return rows.map((row) => ({
      content: row.content,
      userName: row.user_name,
      userId: row.user_id,
      contextWindow: JSON.parse(row.context_window) as ContextMessage[],
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error("[VectorDB] Retrieval error:", error);
    return [];
  }
}

export async function retrieveRecent(
  userId: string,
  hoursAgo: number = 24,
  limit: number = 20
): Promise<RetrievedMessage[]> {
  const db = getDB();
  const since = Date.now() - hoursAgo * 60 * 60 * 1000;

  try {
    const rows = db
      .prepare(
        `
      SELECT content, user_name, user_id, context_window, created_at
      FROM messages
      WHERE user_id = ? AND created_at > ?
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .all(userId, since, limit) as {
      content: string;
      user_name: string;
      user_id: string;
      context_window: string;
      created_at: number;
    }[];

    const results = rows.reverse();

    if (results.length > 0) {
      console.log(`[VectorDB] Found ${results.length} recent messages for user ${userId}:`);
      for (const row of results) {
        console.log(`  [${new Date(row.created_at).toISOString()}] ${row.user_name}: ${row.content.slice(0, 80)}`);
      }
    } else {
      console.log(`[VectorDB] No recent messages found for user ${userId} (last ${hoursAgo}h)`);
    }

    return results.map((row) => ({
      content: row.content,
      userName: row.user_name,
      userId: row.user_id,
      contextWindow: JSON.parse(row.context_window) as ContextMessage[],
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error("[VectorDB] Recent retrieval error:", error);
    return [];
  }
}

export function formatRetrievedForPrompt(
  relevant: RetrievedMessage[],
  recent: RetrievedMessage[]
): string {
  let result = "";

  if (relevant.length > 0) {
    result += "# Relevant things this user has said before:\n";
    for (const msg of relevant) {
      const date = new Date(msg.createdAt).toLocaleDateString("en-US");
      // Show the context window for richer understanding
      const context = msg.contextWindow
        .map((c) => `  ${c.userName}: ${c.content}`)
        .join("\n");
      result += `\n[${date}] Conversation context:\n${context}\n`;
    }
  }

  if (recent.length > 0) {
    result += "\n# What this user has been saying recently (last 24h):\n";
    for (const msg of recent) {
      const time = new Date(msg.createdAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      result += `[${time}] ${msg.userName}: ${msg.content}\n`;
    }
  }

  return result;
}
