import { Collection, Message, Snowflake } from "discord.js";
import { getReplyAIResponse, ReplyAIContext, ChannelMessage } from "./LLM/replyAI";
import { client } from "../index";

/**
 * Handles messages where the bot is mentioned in a reply to another message.
 * 
 * Usage: Reply to someone's message and mention the bot with an instruction
 * Example: "@Bot roast this guy" (as a reply to someone's message)
 */
export class ReplyAIHandler {
  private botId: string | null = null;

  constructor() {
    // Bot ID will be set when the client is ready
    if (client.user) {
      this.botId = client.user.id;
    }
  }

  /**
   * Check if this message should be handled by ReplyAI
   */
  shouldHandle(message: Message): boolean {
    // Update bot ID if not set
    if (!this.botId && client.user) {
      this.botId = client.user.id;
    }

    // Don't respond to bots
    if (message.author.bot) {
      return false;
    }

    // Must mention the bot
    if (!this.botId || !message.mentions.has(this.botId)) {
      return false;
    }

    return true;
  }

  private isReply(message: Message): boolean {
    return !!message.reference?.messageId;
  }

  /**
   * Process the message and generate a response
   */
  async processMessage(message: Message): Promise<void> {
    if (!this.shouldHandle(message)) {
      return;
    }

    try {
      const instruction = this.extractInstruction(message.content);

      if (!instruction || instruction.trim().length === 0) {
        await message.reply("What do you want me to do? Give me an instruction!");
        return;
      }

      // Show typing indicator
      await message.channel.sendTyping();

      // Fetch recent channel history for context
      const channelHistory = await this.fetchChannelHistory(message);

      let context: ReplyAIContext;

      if (this.isReply(message)) {
        // Reply to another message
        const originalMessage = await message.channel.messages.fetch(
          message.reference!.messageId!
        );

        if (!originalMessage) {
          await message.reply("I couldn't find the message you're replying to.");
          return;
        }

        const isReplyToBot = originalMessage.author.id === "959595157462868042";
        const targetMessage = isReplyToBot ? message : originalMessage;

        context = {
          instruction: instruction,
          targetUserId: targetMessage.author.id,
          targetUsername: targetMessage.author.displayName || targetMessage.author.username,
          targetMessageContent: isReplyToBot ? instruction : originalMessage.content,
          requestingUserId: message.author.id,
          channelHistory,
        };

        const response = await getReplyAIResponse(context);

        await targetMessage.reply({
          content: response,
          allowedMentions: { repliedUser: true },
        });
      } else {
        // Direct ping (no reply) — user is talking to the bot directly
        context = {
          instruction: instruction,
          targetUserId: message.author.id,
          targetUsername: message.author.displayName || message.author.username,
          targetMessageContent: instruction,
          requestingUserId: message.author.id,
          channelHistory,
        };

        const response = await getReplyAIResponse(context);

        await message.reply({
          content: response,
          allowedMentions: { repliedUser: true },
        });
      }

    } catch (error) {
      console.error("ReplyAIHandler Error:", error);
      await message.reply("Something went wrong. Try again later.");
    }
  }

  /**
   * Fetch messages from the last hour in the channel for context
   */
  private async fetchChannelHistory(message: Message): Promise<ChannelMessage[]> {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const history: ChannelMessage[] = [];

    try {
      let lastId: string | undefined;
      let done = false;

      while (!done) {
        const options: { limit: number; before?: string } = { limit: 100 };
        if (lastId) options.before = lastId;

        const fetched: Collection<Snowflake, Message> = await message.channel.messages.fetch(options);
        if (fetched.size === 0) break;

        for (const [, msg] of fetched) {
          if (msg.createdTimestamp < oneHourAgo) {
            done = true;
            break;
          }
          // Skip the triggering message itself
          if (msg.id === message.id) continue;

          const entry: ChannelMessage = {
            authorName: msg.author.displayName || msg.author.username,
            content: msg.content,
          };

          if (msg.reference?.messageId) {
            try {
              const replied = await message.channel.messages.fetch(msg.reference.messageId);
              entry.replyTo = replied.author.displayName || replied.author.username;
            } catch {
              // reply target not found, skip
            }
          }

          history.push(entry);
        }

        lastId = fetched.last()?.id;
        if (fetched.size < 100) break;
      }
    } catch (error) {
      console.error("[ReplyAIHandler] Failed to fetch channel history:", error);
    }

    // Return in chronological order (oldest first)
    return history.reverse();
  }

  /**
   * Extract the instruction from the message content (remove bot mention)
   */
  private extractInstruction(content: string): string {
    // Remove all bot mentions from the message
    // Mentions look like <@BOT_ID> or <@!BOT_ID>
    const cleanedContent = content
      .replace(/<@!?\d+>/g, "") // Remove all mentions
      .trim();

    return cleanedContent;
  }
}


