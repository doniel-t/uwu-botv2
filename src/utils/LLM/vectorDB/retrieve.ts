import { getDB } from "./db";
import { embedText } from "./embed";

export type RetrievedMessage = {
  content: string;
  userName: string;
  userId: string;
  discordMessageId: string;
  history: string[];
  replyMessageId: string | null;
  createdAt: number;
};

type MessageRow = {
  content: string;
  user_name: string;
  user_id: string;
  discord_message_id: string;
  history: string;
  reply_message_id: string | null;
  created_at: number;
};

function rowToRetrieved(row: MessageRow): RetrievedMessage {
  return {
    content: row.content,
    userName: row.user_name,
    userId: row.user_id,
    discordMessageId: row.discord_message_id,
    history: JSON.parse(row.history) as string[],
    replyMessageId: row.reply_message_id,
    createdAt: row.created_at,
  };
}

export function getMessagesByIds(ids: string[]): RetrievedMessage[] {
  if (ids.length === 0) return [];
  const db = getDB();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT discord_message_id, content, user_id, user_name, reply_message_id, history, created_at
       FROM messages WHERE discord_message_id IN (${placeholders})`
    )
    .all(...ids) as MessageRow[];
  return rows.map(rowToRetrieved);
}

export async function retrieveRelevant(
  query: string,
  userId: string,
  limit: number = 20
): Promise<RetrievedMessage[]> {
  const db = getDB();

  try {
    const queryEmbedding = await embedText(query);

    const rows = db
      .prepare(
        `
      SELECT
        m.content,
        m.user_name,
        m.user_id,
        m.discord_message_id,
        m.history,
        m.reply_message_id,
        m.created_at,
        e.distance
      FROM (
        SELECT message_id, distance
        FROM message_embeddings
        WHERE embedding MATCH ?
          AND k = ?
      ) e
      INNER JOIN messages m ON m.id = e.message_id
      ORDER BY e.distance
      LIMIT ?
    `
      )
      .all(
        new Float32Array(queryEmbedding),
        limit * 5,
        limit
      ) as (MessageRow & { distance: number })[];

    if (rows.length > 0) {
      console.log(`[VectorDB] Found ${rows.length} relevant messages (query for user ${userId}):`);
      for (const row of rows) {
        console.log(`  [dist=${row.distance.toFixed(4)}] ${row.user_name}: ${row.content.slice(0, 80)}`);
      }
    } else {
      console.log(`[VectorDB] No relevant messages found (query: "${query.slice(0, 60)}")`);
    }

    return rows.map(rowToRetrieved);
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
      SELECT discord_message_id, content, user_name, user_id, reply_message_id, history, created_at
      FROM messages
      WHERE user_id = ? AND created_at > ?
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .all(userId, since, limit) as MessageRow[];

    const results = rows.reverse();

    if (results.length > 0) {
      console.log(`[VectorDB] Found ${results.length} recent messages for user ${userId}`);
    } else {
      console.log(`[VectorDB] No recent messages found for user ${userId} (last ${hoursAgo}h)`);
    }

    return results.map(rowToRetrieved);
  } catch (error) {
    console.error("[VectorDB] Recent retrieval error:", error);
    return [];
  }
}

export type ChannelHistoryMessage = {
  discordMessageId: string;
  content: string;
  userId: string;
  userName: string;
  replyMessageId: string | null;
  createdAt: number;
};

export function getChannelHistory(
  channelId: string,
  hoursAgo: number = 24,
  limit: number = 50
): ChannelHistoryMessage[] {
  const db = getDB();
  const since = Date.now() - hoursAgo * 60 * 60 * 1000;

  const rows = db
    .prepare(
      `SELECT discord_message_id, content, user_id, user_name, reply_message_id, created_at
       FROM messages
       WHERE channel_id = ? AND created_at > ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(channelId, since, limit) as {
    discord_message_id: string;
    content: string;
    user_id: string;
    user_name: string;
    reply_message_id: string | null;
    created_at: number;
  }[];

  return rows.reverse().map((r) => ({
    discordMessageId: r.discord_message_id,
    content: r.content,
    userId: r.user_id,
    userName: r.user_name,
    replyMessageId: r.reply_message_id,
    createdAt: r.created_at,
  }));
}

export function formatRetrievedForPrompt(
  relevant: RetrievedMessage[],
  recent: RetrievedMessage[],
  targetUserId?: string
): string {
  let result = "";

  if (relevant.length > 0) {
    // Expand history for each relevant message
    const allHistoryIds = new Set<string>();
    const allReplyIds = new Set<string>();
    for (const msg of relevant) {
      for (const id of msg.history) allHistoryIds.add(id);
      if (msg.replyMessageId) allReplyIds.add(msg.replyMessageId);
    }
    const contextMessages = getMessagesByIds([...allHistoryIds, ...allReplyIds]);
    const contextMap = new Map(contextMessages.map((m) => [m.discordMessageId, m]));

    // Prioritize: messages from target user first, then others
    let userMessages: RetrievedMessage[];
    let otherMessages: RetrievedMessage[];
    if (targetUserId) {
      userMessages = relevant.filter((m) => m.userId === targetUserId);
      otherMessages = relevant.filter((m) => m.userId !== targetUserId);
    } else {
      userMessages = relevant;
      otherMessages = [];
    }

    const formatGroup = (msgs: RetrievedMessage[]) => {
      let out = "";
      for (const msg of msgs) {
        const date = new Date(msg.createdAt).toLocaleDateString("en-US");

        // Show history context
        const historyMsgs = msg.history
          .map((id) => contextMap.get(id))
          .filter(Boolean) as RetrievedMessage[];

        if (historyMsgs.length > 0) {
          out += `\n[${date}] Conversation context:\n`;
          for (const h of historyMsgs) {
            out += `  ${h.userName}: ${h.content}\n`;
          }
          out += `  ${msg.userName}: ${msg.content}\n`;
        } else {
          out += `\n[${date}] ${msg.userName}: ${msg.content}\n`;
        }

        // Show replied-to message
        if (msg.replyMessageId) {
          const replied = contextMap.get(msg.replyMessageId);
          if (replied) {
            out += `  (replying to ${replied.userName}: ${replied.content})\n`;
          }
        }
      }
      return out;
    };

    if (userMessages.length > 0) {
      result += "# Messages from this user:\n";
      result += formatGroup(userMessages);
    }

    if (otherMessages.length > 0) {
      result += "\n# Related messages from others:\n";
      result += formatGroup(otherMessages);
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
