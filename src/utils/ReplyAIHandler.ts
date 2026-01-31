import { Message } from "discord.js";
import { getReplyAIResponse, ReplyAIContext, ChannelMessage } from "./LLM/replyAI";
import { client } from "../index";
import { getChannelHistory } from "./LLM/vectorDB/retrieve";

/**
 * Handles messages where the bot is mentioned in a reply to another message.
 *
 * Usage: Reply to someone's message and mention the bot with an instruction
 * Example: "@Bot roast this guy" (as a reply to someone's message)
 */
export class ReplyAIHandler {
  private botId: string | null = null;

  constructor() {
    if (client.user) {
      this.botId = client.user.id;
    }
  }

  shouldHandle(message: Message): boolean {
    if (!this.botId && client.user) {
      this.botId = client.user.id;
    }

    if (message.author.bot) {
      return false;
    }

    if (!this.botId || !message.mentions.has(this.botId)) {
      return false;
    }

    return true;
  }

  private isReply(message: Message): boolean {
    return !!message.reference?.messageId;
  }

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

      await message.channel.sendTyping();

      // Fetch channel history from DB instead of Discord API
      const dbHistory = getChannelHistory(message.channel.id, 1, 100);
      const channelHistory: ChannelMessage[] = dbHistory
        .filter((m) => m.discordMessageId !== message.id)
        .map((m) => {
          const entry: ChannelMessage = {
            authorName: m.userName,
            content: m.content,
          };
          if (m.replyMessageId) {
            // Find the replied-to message in the same history
            const replied = dbHistory.find((h) => h.discordMessageId === m.replyMessageId);
            if (replied) {
              entry.replyTo = replied.userName;
            }
          }
          return entry;
        });

      let context: ReplyAIContext;

      if (this.isReply(message)) {
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

  private extractInstruction(content: string): string {
    const cleanedContent = content
      .replace(/<@!?\d+>/g, "")
      .trim();

    return cleanedContent;
  }
}
