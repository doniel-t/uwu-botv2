import { Client, TextChannel, Collection, Message as DiscordMessage } from "discord.js";
import { getDB, isBackfillDone, setBackfillDone, messageExists, ensureEmbeddingTable } from "./db";
import { embedText, embedBatch } from "./embed";
import { users } from "../utils/user/initUsers";

export const TARGET_GUILD_ID = "665991423933546526";

export type ContextMessage = {
  userId: string;
  userName: string;
  content: string;
  timestamp: number;
};

const trackedUserIds = new Set(users.map((u) => u.discordId));

export function isTrackedUser(userId: string): boolean {
  return trackedUserIds.has(userId);
}

export async function storeMessage(
  messageId: string,
  userId: string,
  userName: string,
  channelId: string,
  content: string,
  contextWindow: ContextMessage[],
  createdAt: number
): Promise<void> {
  const db = getDB();

  if (messageExists(messageId)) return;
  if (!content || content.trim().length === 0) return;

  try {
    const embedding = await embedText(content);
    ensureEmbeddingTable(embedding.length);

    const insertMsg = db.prepare(`
      INSERT OR IGNORE INTO messages (message_id, user_id, user_name, channel_id, content, context_window, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertMsg.run(
      messageId,
      userId,
      userName,
      channelId,
      content,
      JSON.stringify(contextWindow),
      createdAt
    );

    if (result.changes > 0) {
      const rowId = Number(result.lastInsertRowid);
      db.prepare(
        "INSERT INTO message_embeddings (message_id, embedding) VALUES (?, ?)"
      ).run(rowId, new Float32Array(embedding));
    }
  } catch (error) {
    console.error(`[VectorDB] Failed to store message ${messageId}:`, error);
  }
}

export async function backfill(client: Client): Promise<void> {
  if (isBackfillDone()) {
    console.log("[VectorDB] Backfill already completed, skipping.");
    return;
  }

  const guild = client.guilds.cache.get(TARGET_GUILD_ID);
  if (!guild) {
    console.error(`[VectorDB] Guild ${TARGET_GUILD_ID} not found.`);
    return;
  }

  console.log("[VectorDB] Starting backfill...");

  const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const channels = guild.channels.cache.filter(
    (ch) => ch.isTextBased() && ch.type === 0 // GuildText
  );

  let totalStored = 0;

  for (const [channelId, channel] of channels) {
    if (!(channel instanceof TextChannel)) continue;

    try {
      console.log(`[VectorDB] Backfilling #${channel.name}...`);
      let lastMessageId: string | undefined;
      let channelDone = false;
      let channelStored = 0;

      // Collect all messages from this channel within timeframe
      const allMessages: DiscordMessage[] = [];

      while (!channelDone) {
        const fetchOptions: { limit: number; before?: string } = { limit: 100 };
        if (lastMessageId) fetchOptions.before = lastMessageId;

        const messages = await channel.messages.fetch(fetchOptions);

        if (messages.size === 0) {
          channelDone = true;
          break;
        }

        for (const [, msg] of messages) {
          if (msg.createdTimestamp < threeMonthsAgo) {
            channelDone = true;
            break;
          }
          allMessages.push(msg);
        }

        lastMessageId = messages.last()?.id;

        // Rate limit: Discord allows 50 requests per second
        await new Promise((r) => setTimeout(r, 200));
      }

      // Sort oldest first
      allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      // Now process only tracked user messages, with context windows
      const trackedMessages = allMessages.filter((m) => isTrackedUser(m.author.id) && m.content.trim().length > 0);

      // Batch embed all tracked messages
      if (trackedMessages.length === 0) continue;

      const texts = trackedMessages.map((m) => m.content);
      let embeddings: number[][];

      try {
        embeddings = await embedBatch(texts);
        if (embeddings.length > 0) {
          ensureEmbeddingTable(embeddings[0].length);
        }
      } catch (error) {
        console.error(`[VectorDB] Batch embedding failed for #${channel.name}:`, error);
        continue;
      }

      const db = getDB();
      const insertMsg = db.prepare(`
        INSERT OR IGNORE INTO messages (message_id, user_id, user_name, channel_id, content, context_window, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertEmbed = db.prepare(
        "INSERT INTO message_embeddings (message_id, embedding) VALUES (?, ?)"
      );

      const transaction = db.transaction(() => {
        for (let i = 0; i < trackedMessages.length; i++) {
          const msg = trackedMessages[i];
          const msgIndex = allMessages.indexOf(msg);

          // Build context window: 5 before, 2 after from ALL messages
          const contextStart = Math.max(0, msgIndex - 5);
          const contextEnd = Math.min(allMessages.length, msgIndex + 3); // +3 = focal + 2 after
          const contextWindow: ContextMessage[] = allMessages
            .slice(contextStart, contextEnd)
            .map((m) => ({
              userId: m.author.id,
              userName: m.author.displayName || m.author.username,
              content: m.content,
              timestamp: m.createdTimestamp,
            }));

          const result = insertMsg.run(
            msg.id,
            msg.author.id,
            msg.author.displayName || msg.author.username,
            channelId,
            msg.content,
            JSON.stringify(contextWindow),
            msg.createdTimestamp
          );

          if (result.changes > 0) {
            insertEmbed.run(result.lastInsertRowid, new Float32Array(embeddings[i]));
            channelStored++;
          }
        }
      });

      transaction();
      totalStored += channelStored;
      console.log(`[VectorDB] #${channel.name}: stored ${channelStored} messages`);

    } catch (error) {
      console.error(`[VectorDB] Error backfilling #${channel.name}:`, error);
    }
  }

  setBackfillDone();
  console.log(`[VectorDB] Backfill complete. Total stored: ${totalStored} messages.`);
}
