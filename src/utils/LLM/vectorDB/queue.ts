import { Message as DiscordMessage } from "discord.js";
import { storeMessage } from "./ingest";
import { getDB } from "./db";

type QueuedMessage = {
  message: DiscordMessage;
  timestamp: number;
};

const messageQueue: QueuedMessage[] = [];
const DELAY_MS = 30_000;

let processingInterval: NodeJS.Timeout | null = null;

export function queueMessage(message: DiscordMessage): void {
  messageQueue.push({
    message,
    timestamp: Date.now(),
  });
}

export function startQueueProcessor(): void {
  if (processingInterval) return;

  processingInterval = setInterval(async () => {
    const now = Date.now();
    const ready: QueuedMessage[] = [];

    while (messageQueue.length > 0 && now - messageQueue[0].timestamp >= DELAY_MS) {
      ready.push(messageQueue.shift()!);
    }

    for (const queued of ready) {
      try {
        const msg = queued.message;

        // Build history from DB: last 5 message IDs in same channel
        const db = getDB();
        const rows = db
          .prepare(
            `SELECT discord_message_id FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT 5`
          )
          .all(msg.channel.id) as { discord_message_id: string }[];

        const history = rows.map((r) => r.discord_message_id).reverse();
        const replyMessageId = msg.reference?.messageId ?? null;

        await storeMessage(
          msg.id,
          msg.author.id,
          msg.author.displayName || msg.author.username,
          msg.channel.id,
          msg.content,
          replyMessageId,
          history,
          msg.createdTimestamp
        );
      } catch (error) {
        console.error("[VectorDB] Error processing queued message:", error);
      }
    }
  }, 5_000);
}

export function stopQueueProcessor(): void {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }
}
