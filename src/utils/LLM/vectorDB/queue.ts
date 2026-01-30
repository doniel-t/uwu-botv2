import { Message as DiscordMessage, Collection } from "discord.js";
import { storeMessage, ContextMessage } from "./ingest";

// Queue messages for 30 seconds to allow context window to fill
type QueuedMessage = {
  message: DiscordMessage;
  timestamp: number;
};

const messageQueue: QueuedMessage[] = [];
const DELAY_MS = 30_000; // 30 seconds

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

    // Find messages that have waited long enough
    while (messageQueue.length > 0 && now - messageQueue[0].timestamp >= DELAY_MS) {
      ready.push(messageQueue.shift()!);
    }

    for (const queued of ready) {
      try {
        // Fetch context window: 5 messages before, 2 messages after
        const channel = queued.message.channel;
        const contextMessages: ContextMessage[] = [];

        // Fetch messages before
        const beforeMessages = await channel.messages.fetch({
          before: queued.message.id,
          limit: 5,
        });

        // Reverse so oldest is first
        const beforeArray: any[] = Array.from(beforeMessages.values()).reverse();
        for (const msg of beforeArray) {
          contextMessages.push({
            userId: msg.author.id,
            userName: msg.author.displayName || msg.author.username,
            content: msg.content,
            timestamp: msg.createdTimestamp,
          });
        }

        // Add the focal message
        contextMessages.push({
          userId: queued.message.author.id,
          userName: queued.message.author.displayName || queued.message.author.username,
          content: queued.message.content,
          timestamp: queued.message.createdTimestamp,
        });

        // Fetch messages after
        const afterMessages = await channel.messages.fetch({
          after: queued.message.id,
          limit: 2,
        });

        const afterArray: any[] = Array.from(afterMessages.values()).reverse();
        for (const msg of afterArray) {
          contextMessages.push({
            userId: msg.author.id,
            userName: msg.author.displayName || msg.author.username,
            content: msg.content,
            timestamp: msg.createdTimestamp,
          });
        }

        await storeMessage(
          queued.message.id,
          queued.message.author.id,
          queued.message.author.displayName || queued.message.author.username,
          queued.message.channel.id,
          queued.message.content,
          contextMessages,
          queued.message.createdTimestamp
        );
      } catch (error) {
        console.error("[VectorDB] Error processing queued message:", error);
      }
    }
  }, 5_000); // Check every 5 seconds
}

export function stopQueueProcessor(): void {
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }
}
