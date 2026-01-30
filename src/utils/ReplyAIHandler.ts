import { Message } from "discord.js";
import { getReplyAIResponse, ReplyAIContext } from "./LLM/replyAI";
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


