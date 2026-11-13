import { Message } from "discord.js";
import { getV2DB } from "./db";
import { getGuildAliases, NameRef, refreshAutoAliases, resolveNameRefs } from "./nicknames";
import type { ImageInfo } from "./vision";
import { imagesOf } from "./vision";

export type StoredMessage = {
  guildId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  authorName: string;
  isOwnBot: boolean;
  content: string;
  replyToMessageId: string | null;
  mentionedUserIds: string[];
  nameRefs: NameRef[];
  images: ImageInfo[];
  triggerMessageId: string | null;
  createdAt: number;
  editedAt: number | null;
  deletedAt: number | null;
  revision: number;
};

type Row = {
  guild_id: string;
  channel_id: string;
  message_id: string;
  author_id: string;
  author_name: string;
  is_own_bot: number;
  content: string;
  reply_to_message_id: string | null;
  mentioned_user_ids: string;
  name_refs: string;
  images: string;
  trigger_message_id: string | null;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
  revision: number;
};

function fromRow(r: Row): StoredMessage {
  return {
    guildId: r.guild_id,
    channelId: r.channel_id,
    messageId: r.message_id,
    authorId: r.author_id,
    authorName: r.author_name,
    isOwnBot: r.is_own_bot === 1,
    content: r.content,
    replyToMessageId: r.reply_to_message_id,
    mentionedUserIds: JSON.parse(r.mentioned_user_ids),
    nameRefs: JSON.parse(r.name_refs),
    images: JSON.parse(r.images ?? "[]"),
    triggerMessageId: r.trigger_message_id,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    deletedAt: r.deleted_at,
    revision: r.revision,
  };
}

/**
 * Text content plus short markers for non-image attachments and stickers.
 * Images are stored separately (with captions) in the images column.
 */
function contentOf(message: Message): string {
  const extras: string[] = [];
  const imageUrls = new Set(imagesOf(message).map((i) => i.url));
  message.attachments?.forEach((a) => {
    if (!imageUrls.has(a.url)) extras.push(`[attachment: ${a.name ?? "file"}]`);
  });
  message.stickers?.forEach((s) => extras.push(`[sticker: ${s.name}]`));
  return [message.content, ...extras].filter(Boolean).join(" ");
}

function authorName(message: Message): string {
  return message.member?.displayName || message.author.displayName || message.author.username;
}

function recentParticipants(guildId: string, channelId: string, before: number): Set<string> {
  const rows = getV2DB()
    .prepare(
      `SELECT DISTINCT author_id FROM (
         SELECT author_id FROM messages WHERE guild_id = ? AND channel_id = ? AND created_at <= ?
         ORDER BY created_at DESC LIMIT 20)`
    )
    .all(guildId, channelId, before) as { author_id: string }[];
  return new Set(rows.map((r) => r.author_id));
}

function computeNameRefs(message: Message, ownBotId: string | undefined): NameRef[] {
  const guildId = message.guild!.id;
  return resolveNameRefs(message.content, getGuildAliases(guildId), {
    recentParticipantIds: recentParticipants(guildId, message.channel.id, message.createdTimestamp),
    isInstruction: !!ownBotId && message.mentions.users.has(ownBotId),
  });
}

/**
 * Persist a Discord message immediately (no embedding, no delay). Safe to
 * call twice for the same message.
 */
export function storeDiscordMessage(
  message: Message,
  opts: { ownBotId?: string; triggerMessageId?: string | null; skipImages?: boolean } = {}
): void {
  if (!message.guild) return;
  const guildId = message.guild.id;
  const isOwnBot = !!opts.ownBotId && message.author.id === opts.ownBotId;

  if (!isOwnBot) {
    refreshAutoAliases(guildId, message.author.id, {
      displayName: message.member?.displayName,
      globalName: message.author.globalName,
      username: message.author.username,
    });
    message.mentions.members?.forEach((m) =>
      refreshAutoAliases(guildId, m.id, { displayName: m.displayName, globalName: m.user.globalName, username: m.user.username })
    );
  }

  const mentioned = [...message.mentions.users.keys()].filter((id) => id !== opts.ownBotId);
  const nameRefs = isOwnBot ? [] : computeNameRefs(message, opts.ownBotId);

  getV2DB()
    .prepare(
      `INSERT OR IGNORE INTO messages (guild_id, channel_id, message_id, author_id, author_name, is_own_bot, content,
         reply_to_message_id, mentioned_user_ids, name_refs, images, trigger_message_id, created_at, extracted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      guildId,
      message.channel.id,
      message.id,
      message.author.id,
      authorName(message),
      isOwnBot ? 1 : 0,
      contentOf(message),
      message.reference?.messageId ?? null,
      JSON.stringify(mentioned),
      JSON.stringify(nameRefs),
      JSON.stringify(
        isOwnBot ? [] : imagesOf(message).map((i) => (opts.skipImages && i.state === "pending" ? { ...i, state: "skipped" } : i))
      ),
      opts.triggerMessageId ?? null,
      message.createdTimestamp,
      // Bots' messages are never evidence for facts.
      message.author.bot ? 1 : 0
    );
}

export function markEdited(message: Message, ownBotId?: string): void {
  if (!message.guild || message.content == null) return;
  const nameRefs = computeNameRefs(message, ownBotId);
  getV2DB()
    .prepare(
      `UPDATE messages SET content = ?, name_refs = ?, edited_at = ?, revision = revision + 1,
         extracted = CASE WHEN is_own_bot = 1 THEN 1 ELSE 0 END
       WHERE guild_id = ? AND message_id = ?`
    )
    .run(contentOf(message), JSON.stringify(nameRefs), Date.now(), message.guild.id, message.id);
}

/**
 * Discord fills in link-preview embeds (Tenor GIFs, tweets...) with a later
 * messageUpdate. Merge newly appeared images, keeping existing captions.
 * Returns true when there is something new to caption.
 */
export function mergeImages(message: Message): boolean {
  if (!message.guild) return false;
  const stored = getMessage(message.guild.id, message.id);
  if (!stored || stored.isOwnBot) return false;
  const known = new Set(stored.images.map((i) => i.url));
  const fresh = imagesOf(message).filter((i) => !known.has(i.url));
  if (fresh.length === 0) return false;
  const merged = [...stored.images, ...fresh].slice(0, 4);
  setMessageImages(message.guild.id, message.id, merged);
  return merged.some((i) => i.state === "pending");
}

export function setMessageImages(guildId: string, messageId: string, images: ImageInfo[]): void {
  getV2DB()
    .prepare("UPDATE messages SET images = ? WHERE guild_id = ? AND message_id = ?")
    .run(JSON.stringify(images), guildId, messageId);
}

export function markDeleted(guildId: string, messageId: string): void {
  getV2DB()
    .prepare("UPDATE messages SET deleted_at = ?, content = '' WHERE guild_id = ? AND message_id = ?")
    .run(Date.now(), guildId, messageId);
}

export function getMessage(guildId: string, messageId: string): StoredMessage | null {
  const row = getV2DB()
    .prepare("SELECT * FROM messages WHERE guild_id = ? AND message_id = ?")
    .get(guildId, messageId) as Row | undefined;
  return row ? fromRow(row) : null;
}

/** Most recent non-deleted messages in a channel/thread, oldest first. */
export function getRecentMessages(guildId: string, channelId: string, limit: number, sinceMs?: number): StoredMessage[] {
  const rows = getV2DB()
    .prepare(
      `SELECT * FROM messages WHERE guild_id = ? AND channel_id = ? AND deleted_at IS NULL AND created_at >= ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(guildId, channelId, sinceMs ?? 0, limit) as Row[];
  return rows.map(fromRow).reverse();
}

/** The `limit` messages right before a timestamp in a channel, oldest first. */
export function getMessagesBefore(guildId: string, channelId: string, beforeMs: number, limit: number): StoredMessage[] {
  const rows = getV2DB()
    .prepare(
      `SELECT * FROM messages WHERE guild_id = ? AND channel_id = ? AND deleted_at IS NULL AND created_at < ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(guildId, channelId, beforeMs, limit) as Row[];
  return rows.map(fromRow).reverse();
}

export type MessageSearch = {
  from: number;
  to: number;
  authorIds?: string[];
  channelIds?: string[];
  /** every word must appear (case-insensitive substring) */
  words?: string[];
  limit: number;
};

/**
 * Stored messages in a time range, oldest first. Returns the total match count
 * so callers can say when results were cut off.
 */
export function searchMessages(guildId: string, q: MessageSearch): { messages: StoredMessage[]; total: number } {
  const where = ["guild_id = ?", "deleted_at IS NULL", "created_at >= ?", "created_at <= ?"];
  const args: (string | number)[] = [guildId, q.from, q.to];
  if (q.authorIds?.length) {
    where.push(`author_id IN (${q.authorIds.map(() => "?").join(",")})`);
    args.push(...q.authorIds);
  }
  if (q.channelIds?.length) {
    where.push(`channel_id IN (${q.channelIds.map(() => "?").join(",")})`);
    args.push(...q.channelIds);
  }
  for (const w of (q.words ?? []).slice(0, 5)) {
    where.push("LOWER(content || ' ' || images) LIKE ? ESCAPE '\\'");
    args.push(`%${w.toLowerCase().replace(/[\\%_]/g, (c) => "\\" + c)}%`);
  }
  const db = getV2DB();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE ${where.join(" AND ")}`).get(...args) as { c: number }).c;
  const rows = db
    .prepare(`SELECT * FROM messages WHERE ${where.join(" AND ")} ORDER BY created_at ASC LIMIT ?`)
    .all(...args, q.limit) as Row[];
  return { messages: rows.map(fromRow), total };
}

/** Oldest and newest stored message time for a guild (what the log covers). */
export function storedRange(guildId: string): { first: number | null; last: number | null } {
  const r = getV2DB()
    .prepare("SELECT MIN(created_at) AS first, MAX(created_at) AS last FROM messages WHERE guild_id = ?")
    .get(guildId) as { first: number | null; last: number | null };
  return r;
}

export function getMessagesAround(guildId: string, channelId: string, messageId: string, limit: number): StoredMessage[] {
  const anchor = getMessage(guildId, messageId);
  if (!anchor || anchor.channelId !== channelId) return [];
  const half = Math.max(1, Math.floor(limit / 2));
  const before = getV2DB()
    .prepare(
      `SELECT * FROM messages WHERE guild_id = ? AND channel_id = ? AND deleted_at IS NULL AND created_at <= ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(guildId, channelId, anchor.createdAt, half + 1) as Row[];
  const after = getV2DB()
    .prepare(
      `SELECT * FROM messages WHERE guild_id = ? AND channel_id = ? AND deleted_at IS NULL AND created_at > ?
       ORDER BY created_at ASC LIMIT ?`
    )
    .all(guildId, channelId, anchor.createdAt, half) as Row[];
  return [...before.reverse(), ...after].map(fromRow);
}

export function getUnextracted(guildId: string, sinceMs: number, limit: number): StoredMessage[] {
  const rows = getV2DB()
    .prepare(
      `SELECT * FROM messages WHERE guild_id = ? AND extracted = 0 AND deleted_at IS NULL AND created_at >= ?
       ORDER BY channel_id, created_at LIMIT ?`
    )
    .all(guildId, sinceMs, limit) as Row[];
  return rows.map(fromRow);
}

export function getUnextractedInChannel(guildId: string, channelId: string, sinceMs: number, limit: number): StoredMessage[] {
  const rows = getV2DB()
    .prepare(
      `SELECT * FROM messages WHERE guild_id = ? AND channel_id = ? AND extracted = 0 AND deleted_at IS NULL AND created_at >= ?
       ORDER BY created_at LIMIT ?`
    )
    .all(guildId, channelId, sinceMs, limit) as Row[];
  return rows.map(fromRow);
}

export function channelsWithPendingExtraction(guildId: string, sinceMs: number): string[] {
  const rows = getV2DB()
    .prepare(
      "SELECT DISTINCT channel_id FROM messages WHERE guild_id = ? AND extracted = 0 AND deleted_at IS NULL AND created_at >= ?"
    )
    .all(guildId, sinceMs) as { channel_id: string }[];
  return rows.map((r) => r.channel_id);
}

/** Stats for a backfill estimate: unprocessed messages in [since, until] for some channels. */
export function getUnextractedRange(guildId: string, channelIds: string[], since: number, until: number): StoredMessage[] {
  if (channelIds.length === 0) return [];
  const ph = channelIds.map(() => "?").join(",");
  const rows = getV2DB()
    .prepare(
      `SELECT * FROM messages WHERE guild_id = ? AND channel_id IN (${ph}) AND extracted = 0 AND deleted_at IS NULL
         AND created_at >= ? AND created_at <= ? ORDER BY channel_id, created_at`
    )
    .all(guildId, ...channelIds, since, until) as Row[];
  return rows.map(fromRow);
}

export function markExtracted(guildId: string, items: { messageId: string; revision: number }[]): void {
  const stmt = getV2DB().prepare(
    "UPDATE messages SET extracted = 1 WHERE guild_id = ? AND message_id = ? AND revision = ?"
  );
  getV2DB().transaction(() => {
    for (const it of items) stmt.run(guildId, it.messageId, it.revision);
  })();
}

export function guildsWithPendingExtraction(): string[] {
  const rows = getV2DB()
    .prepare("SELECT DISTINCT guild_id FROM messages WHERE extracted = 0 AND deleted_at IS NULL")
    .all() as { guild_id: string }[];
  return rows.map((r) => r.guild_id);
}
