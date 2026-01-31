import { Client, TextChannel, Message as DiscordMessage } from "discord.js";
import { getDB, isBackfillDone, setBackfillDone, messageExists, ensureEmbeddingTable } from "./db";
import { embedText, embedBatch } from "./embed";

export const TARGET_GUILD_ID = "665991423933546526";

export async function storeMessage(
  discordMessageId: string,
  userId: string,
  userName: string,
  channelId: string,
  content: string,
  replyMessageId: string | null,
  history: string[],
  createdAt: number
): Promise<void> {
  const db = getDB();

  if (messageExists(discordMessageId)) return;
  if (!content || content.trim().length === 0) return;

  try {
    const embedding = await embedText(content);
    ensureEmbeddingTable(embedding.length);

    const insertMsg = db.prepare(`
      INSERT OR IGNORE INTO messages (discord_message_id, content, user_id, user_name, reply_message_id, history, channel_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertMsg.run(
      discordMessageId,
      content,
      userId,
      userName,
      replyMessageId,
      JSON.stringify(history),
      channelId,
      createdAt
    );

    if (result.changes > 0) {
      db.prepare(
        "INSERT INTO message_embeddings (message_id, embedding) VALUES (?, ?)"
      ).run(BigInt(result.lastInsertRowid), new Float32Array(embedding));
    }
  } catch (error) {
    console.error(`[VectorDB] Failed to store message ${discordMessageId}:`, error);
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
    (ch) => ch.isTextBased() && ch.type === 0
  );

  let totalStored = 0;

  for (const [channelId, channel] of channels) {
    if (!(channel instanceof TextChannel)) continue;

    try {
      console.log(`[VectorDB] Backfilling #${channel.name}...`);
      let lastMessageId: string | undefined;
      let channelDone = false;
      let channelStored = 0;

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
        await new Promise((r) => setTimeout(r, 200));
      }

      // Sort oldest first
      allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      // Store ALL messages (not just tracked users)
      const storableMessages = allMessages.filter((m) => m.content.trim().length > 0);
      if (storableMessages.length === 0) continue;

      const texts = storableMessages.map((m) => m.content);
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
        INSERT OR IGNORE INTO messages (discord_message_id, content, user_id, user_name, reply_message_id, history, channel_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertEmbed = db.prepare(
        "INSERT INTO message_embeddings (message_id, embedding) VALUES (?, ?)"
      );

      const transaction = db.transaction(() => {
        for (let i = 0; i < storableMessages.length; i++) {
          const msg = storableMessages[i];
          const msgIndex = allMessages.indexOf(msg);

          // Build history: up to 5 previous message IDs
          const historyIds: string[] = [];
          for (let j = msgIndex - 1; j >= Math.max(0, msgIndex - 5); j--) {
            historyIds.unshift(allMessages[j].id);
          }

          const replyMessageId = msg.reference?.messageId ?? null;

          const result = insertMsg.run(
            msg.id,
            msg.content,
            msg.author.id,
            msg.author.displayName || msg.author.username,
            replyMessageId,
            JSON.stringify(historyIds),
            channelId,
            msg.createdTimestamp
          );

          if (result.changes > 0) {
            insertEmbed.run(BigInt(result.lastInsertRowid), new Float32Array(embeddings[i]));
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
