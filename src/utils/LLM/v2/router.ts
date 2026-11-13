import { Client, Message, PartialMessage } from "discord.js";
import { resumeBackfills } from "./backfill";
import { getV2DB } from "./db";
import { cancelForDeletedTrigger, handleMention } from "./engine";
import { onEvidenceChanged, scheduleExtraction, startExtractionWorker } from "./facts";
import { getMessage, markDeleted, markEdited, mergeImages, storeDiscordMessage } from "./messages";
import { queueCaptions, setOnCaptioned } from "./vision";
import { startProfileWorker } from "./profiles";
import { getAISettings } from "./settings";

/**
 * Glue between Discord events and the v2 memory engine. The legacy engine is
 * untouched; index.ts asks `usesMemoryEngine()` which path to take.
 */

export function initMemoryV2(client?: Client): void {
  getV2DB();
  if (client) resumeBackfills(client).catch((err) => console.error("[MemoryV2] Backfill resume failed:", err));
  // Once an image has a caption, facts can be learned from it.
  setOnCaptioned((guildId, channelId) => scheduleExtraction(guildId, channelId));
  startExtractionWorker();
  startProfileWorker();
}

export function usesMemoryEngine(guildId: string): boolean {
  return getAISettings(guildId).engine === "memory";
}

/**
 * Store every message in guilds that use the memory engine, synchronously,
 * before anything async runs, so a quick follow-up ping already sees it.
 */
export function observeMessage(message: Message, botId: string | undefined): void {
  if (!message.guild || !usesMemoryEngine(message.guild.id)) return;
  // Other bots are ignored entirely; our own replies are stored when sent.
  if (message.author.bot) return;
  try {
    storeDiscordMessage(message, { ownBotId: botId });
    queueCaptions(message);
    // Learn facts from it within seconds (debounced per channel).
    scheduleExtraction(message.guild.id, message.channel.id);
  } catch (err) {
    console.error("[MemoryV2] Failed to store message:", err);
  }
}

export async function routeMention(message: Message, botId: string): Promise<void> {
  await handleMention(message, botId);
}

export function observeUpdate(newMessage: Message | PartialMessage, botId: string | undefined): void {
  if (!newMessage.guild || !usesMemoryEngine(newMessage.guild.id)) return;
  if (newMessage.partial || newMessage.author?.bot) return;
  const existing = getMessage(newMessage.guild.id, newMessage.id);
  if (!existing) return;
  try {
    // Link previews (Tenor GIFs etc.) arrive as an update with the same text.
    if (mergeImages(newMessage as Message)) queueCaptions(newMessage as Message);
  } catch (err) {
    console.error("[MemoryV2] Failed to merge images:", err);
  }
  if (existing.content === newMessage.content) return;
  try {
    markEdited(newMessage as Message, botId);
    onEvidenceChanged(newMessage.guild.id, newMessage.id);
    scheduleExtraction(newMessage.guild.id, newMessage.channelId);
  } catch (err) {
    console.error("[MemoryV2] Failed to update message:", err);
  }
}

export function observeDelete(message: Message | PartialMessage): void {
  if (!message.guildId) return;
  cancelForDeletedTrigger(message.id);
  if (!getMessage(message.guildId, message.id)) return;
  try {
    markDeleted(message.guildId, message.id);
    onEvidenceChanged(message.guildId, message.id);
  } catch (err) {
    console.error("[MemoryV2] Failed to delete message:", err);
  }
}
