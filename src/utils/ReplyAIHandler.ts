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

    // Must be a reply to another message
    if (!message.reference?.messageId) {
      return false;
    }

    // Must mention the bot
    if (!this.botId || !message.mentions.has(this.botId)) {
      return false;
    }

    // Don't respond to bots
    if (message.author.bot) {
      return false;
    }

    return true;
  }

  /**
   * Process the message and generate a response
   */
  async processMessage(message: Message): Promise<void> {
    if (!this.shouldHandle(message)) {
      return;
    }

    try {
      // Fetch the original message being replied to
      const originalMessage = await message.channel.messages.fetch(
        message.reference!.messageId!
      );

      if (!originalMessage) {
        await message.reply("I couldn't find the message you're replying to.");
        return;
      }

      // Extract the instruction (remove the bot mention from the message)
      const instruction = this.extractInstruction(message.content);

      if (!instruction || instruction.trim().length === 0) {
        await message.reply("What do you want me to do? Give me an instruction!");
        return;
      }

      // Show typing indicator
      await message.channel.sendTyping();

      // Build the context
      const context: ReplyAIContext = {
        instruction: instruction,
        targetUserId: originalMessage.author.id,
        targetUsername: originalMessage.author.displayName || originalMessage.author.username,
        targetMessageContent: originalMessage.content,
        requestingUserId: message.author.id,
      };

      // Get the AI response
      const response = await getReplyAIResponse(context);

      // Reply to the original message (not the command message)
      await originalMessage.reply({
        content: response,
        allowedMentions: { repliedUser: true },
      });

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


