import { GuildTextBasedChannel, Message } from "discord.js";
import type { ModelMessage } from "ai";
import { getMessage, getRecentMessages, StoredMessage, storeDiscordMessage } from "./messages";
import { nicknamesFor, NameRef } from "./nicknames";
import { renderImages } from "./vision";

export const TIMEZONE = process.env.BOT_TIMEZONE || "Europe/Berlin";

const RECENT_LIMIT = 40;
const RECENT_WINDOW_MS = 6 * 60 * 60 * 1000;
const REPLY_CHAIN_DEPTH = 10;
const CHAR_BUDGET = 16_000; // ~4k tokens
const BACKFILL_THRESHOLD = 15;

export type TargetSource = "mention" | "reply" | "nickname" | "self";

export type BuiltContext = {
  messages: ModelMessage[];
  requesterId: string;
  targetIds: string[];
  targetSource: TargetSource;
  ambiguousRefs: NameRef[];
  participantIds: string[];
  /** short ref (m1, m2, ...) -> Discord message ID */
  refMap: Map<string, string>;
  /** human-readable roster lines, also used by tools */
  names: Map<string, string>;
  /** the message the bot should reply to on Discord */
  replyTargetMessageId: string;
  /** text used for fact relevance scoring */
  topicText: string;
  /** messages whose images the reply model should see directly */
  imageSources: { ref: string; label: string; messageId: string }[];
};

const fmtTime = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(
    new Date(ms)
  );

/** Make sure the DB has recent history for this channel (e.g. right after enabling the engine). */
export async function ensureChannelHistory(trigger: Message, botId: string): Promise<void> {
  const guildId = trigger.guild!.id;
  const have = getRecentMessages(guildId, trigger.channel.id, BACKFILL_THRESHOLD, Date.now() - RECENT_WINDOW_MS);
  if (have.length >= BACKFILL_THRESHOLD) return;
  try {
    const fetched = await (trigger.channel as GuildTextBasedChannel).messages.fetch({ limit: RECENT_LIMIT, before: trigger.id });
    fetched.forEach((m) => storeDiscordMessage(m, { ownBotId: botId }));
  } catch (err) {
    console.warn("[MemoryV2] Could not backfill channel history:", (err as Error).message);
  }
}

async function loadReplyChain(trigger: Message, start: string | null, botId: string): Promise<StoredMessage[]> {
  const guildId = trigger.guild!.id;
  const chain: StoredMessage[] = [];
  let id = start;
  for (let depth = 0; id && depth < REPLY_CHAIN_DEPTH; depth++) {
    let m = getMessage(guildId, id);
    if (!m) {
      try {
        const fetched = await (trigger.channel as GuildTextBasedChannel).messages.fetch(id);
        storeDiscordMessage(fetched, { ownBotId: botId });
        m = getMessage(guildId, id);
      } catch {
        break; // deleted or no permission
      }
    }
    if (!m || m.deletedAt) break;
    chain.push(m);
    id = m.replyToMessageId;
  }
  return chain.reverse();
}

function resolveTargets(trigger: StoredMessage, repliedTo: StoredMessage | null, botId: string) {
  const mentioned = trigger.mentionedUserIds.filter((id) => id !== botId && id !== trigger.authorId);
  if (mentioned.length > 0) return { ids: mentioned, source: "mention" as TargetSource };

  if (repliedTo && !repliedTo.isOwnBot && repliedTo.authorId !== trigger.authorId) {
    return { ids: [repliedTo.authorId], source: "reply" as TargetSource };
  }

  const named = trigger.nameRefs
    .filter((r) => r.confidence === "high" && r.userId && r.userId !== botId && r.userId !== trigger.authorId)
    .map((r) => r.userId!);
  if (named.length > 0) return { ids: [...new Set(named)], source: "nickname" as TargetSource };

  return { ids: [trigger.authorId], source: "self" as TargetSource };
}

export async function buildContext(trigger: Message, botId: string): Promise<BuiltContext> {
  const guildId = trigger.guild!.id;
  const channelId = trigger.channel.id;

  await ensureChannelHistory(trigger, botId);
  const self = getMessage(guildId, trigger.id);
  if (!self) throw new Error("trigger message was not stored");

  const chain = await loadReplyChain(trigger, self.replyToMessageId, botId);
  const repliedTo = chain.length > 0 ? chain[chain.length - 1] : null;

  // Recent window. Human messages after the trigger belong to later requests;
  // our own replies (to earlier requests) are always included.
  const recent = getRecentMessages(guildId, channelId, RECENT_LIMIT + 10, Date.now() - RECENT_WINDOW_MS).filter(
    (m) => m.messageId !== self.messageId && (m.isOwnBot || m.createdAt <= self.createdAt)
  );

  const byId = new Map<string, StoredMessage>();
  for (const m of [...recent, ...chain]) byId.set(m.messageId, m);
  const chainIds = new Set(chain.map((m) => m.messageId));

  // Order bot replies right after the request that triggered them.
  const sortKey = (m: StoredMessage) => {
    if (m.isOwnBot && m.triggerMessageId) {
      const t = byId.get(m.triggerMessageId) ?? (m.triggerMessageId === self.messageId ? self : null);
      if (t) return t.createdAt + 0.5;
    }
    return m.createdAt;
  };
  let transcript = [...byId.values()].sort((a, b) => sortKey(a) - sortKey(b));

  // Trim oldest non-chain messages to the budget.
  const size = (m: StoredMessage) => m.content.length + 60;
  let total = transcript.reduce((s, m) => s + size(m), 0);
  while (total > CHAR_BUDGET) {
    const i = transcript.findIndex((m) => !chainIds.has(m.messageId));
    if (i < 0) break;
    total -= size(transcript[i]);
    transcript.splice(i, 1);
  }
  transcript = transcript.slice(-RECENT_LIMIT - chain.length);

  const target = resolveTargets(self, repliedTo, botId);

  // Short refs keep the prompt compact; the map lets tools translate back.
  const refMap = new Map<string, string>();
  const refOf = new Map<string, string>();
  [...transcript, self].forEach((m, i) => {
    const ref = `m${i + 1}`;
    refMap.set(ref, m.messageId);
    refOf.set(m.messageId, ref);
  });

  // Roster: who is who.
  const names = new Map<string, string>();
  const note = (id: string, name?: string) => {
    if (!names.has(id) || name) names.set(id, name ?? names.get(id) ?? "unknown");
  };
  for (const m of [...transcript, self]) {
    note(m.authorId, m.authorName);
    m.mentionedUserIds.forEach((id) => note(id));
    m.nameRefs.forEach((r) => r.userIds.forEach((id) => note(id)));
  }
  target.ids.forEach((id) => note(id));
  // Fill unknown names from the guild member cache.
  for (const [id, n] of names) {
    if (n !== "unknown") continue;
    const member = trigger.guild!.members.cache.get(id);
    if (member) names.set(id, member.displayName);
  }
  names.delete(botId);

  const participantIds = [...names.keys()];
  const nicks = nicknamesFor(guildId, participantIds);

  const label = (id: string) => (id === botId ? "you (the bot)" : `${names.get(id) ?? "unknown"} [user ${id}]`);

  const renderContent = (m: StoredMessage): string => {
    let text = m.content;
    // Annotate nickname references (right to left so offsets stay valid).
    const refs = [...m.nameRefs].filter((r) => r.confidence !== "low").sort((a, b) => b.start - a.start);
    for (const r of refs) {
      const tag =
        r.confidence === "ambiguous"
          ? ` [ambiguous: ${r.userIds.map(label).join(" or ")}]`
          : r.userId && r.userId !== m.authorId
          ? ` [= ${label(r.userId)}]`
          : r.userId === m.authorId
          ? ` [= the author themself]`
          : "";
      text = text.slice(0, r.end) + tag + text.slice(r.end);
    }
    text = text.replace(/<@!?(\d+)>/g, (_, id) => (id === botId ? "@bot" : `@${label(id)}`));
    if (m.images.length) text = `${text} ${renderImages(m.images)}`.trim();
    return text || "(empty)";
  };

  const renderLine = (m: StoredMessage): string => {
    const ref = refOf.get(m.messageId);
    const parent = m.replyToMessageId ? byId.get(m.replyToMessageId) : undefined;
    const replyPart = m.replyToMessageId
      ? parent
        ? ` replying to ${refOf.get(parent.messageId)} by ${parent.isOwnBot ? "you" : label(parent.authorId)}`
        : " replying to an older message"
      : "";
    return `[${ref} · ${fmtTime(m.createdAt)}] ${label(m.authorId)}${replyPart}: ${renderContent(m)}`;
  };

  // Human lines become user turns; only our own real outputs are assistant turns.
  const messages: ModelMessage[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    messages.push({ role: "user", content: `<chat_log>\n${buffer.join("\n")}\n</chat_log>` });
    buffer = [];
  };
  for (const m of transcript) {
    if (m.isOwnBot) {
      if (messages.length === 0 && buffer.length === 0) buffer.push("(conversation starts mid-way)");
      flush();
      messages.push({ role: "assistant", content: m.content || "(empty)" });
    } else {
      buffer.push(renderLine(m));
    }
  }
  flush();

  const rosterLines = participantIds.map((id) => {
    const extra = nicks.get(id);
    return `- ${names.get(id)} [user ${id}]${extra?.length ? ` · nicknames: ${extra.join(", ")}` : ""}`;
  });

  const ambiguousRefs = self.nameRefs.filter((r) => r.confidence === "ambiguous");
  const targetLine =
    target.source === "self"
      ? `${label(self.authorId)} (no one else was mentioned, so the requester themself)`
      : `${target.ids.map(label).join(", ")} (resolved via ${target.source})`;

  const request = [
    "<participants>",
    ...rosterLines,
    "</participants>",
    "",
    "<current_request>",
    `Requester: ${label(self.authorId)}`,
    `Target: ${targetLine}`,
    repliedTo
      ? `The requester replied to ${refOf.get(repliedTo.messageId)} by ${repliedTo.isOwnBot ? "you" : label(repliedTo.authorId)}: "${renderContent(repliedTo).slice(0, 600)}"`
      : null,
    ambiguousRefs.length
      ? `Ambiguous names in the request: ${ambiguousRefs.map((r) => `"${r.text}" could be ${r.userIds.map(label).join(" or ")}`).join("; ")}. If it matters, ask which one.`
      : null,
    `Instruction (${refOf.get(self.messageId)}): ${renderContent(self)}`,
    "</current_request>",
  ]
    .filter((l) => l !== null)
    .join("\n");

  messages.push({ role: "user", content: request });

  // Anthropic-style APIs need the first turn to be a user turn, and some
  // providers reject consecutive turns with the same role.
  if (messages[0].role !== "user") messages.unshift({ role: "user", content: "(conversation starts mid-way)" });
  const merged: ModelMessage[] = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role && typeof last.content === "string" && typeof m.content === "string") {
      merged[merged.length - 1] = { ...last, content: `${last.content}

${m.content}` } as ModelMessage;
    } else {
      merged.push(m);
    }
  }

  const withCaptions = (m: StoredMessage | null | undefined) =>
    m ? `${m.content} ${m.images.map((i) => i.caption ?? "").join(" ")}` : "";
  const topicText = [withCaptions(self), withCaptions(repliedTo), ...transcript.slice(-6).map(withCaptions)].join(" ");

  const imageSources = [self, repliedTo]
    .filter((m): m is StoredMessage => !!m && m.images.length > 0)
    .map((m) => ({ ref: refOf.get(m.messageId)!, label: m.isOwnBot ? "you" : label(m.authorId), messageId: m.messageId }));

  return {
    messages: merged,
    requesterId: self.authorId,
    targetIds: target.ids,
    targetSource: target.source,
    ambiguousRefs,
    participantIds,
    refMap,
    names,
    replyTargetMessageId: target.source === "reply" && repliedTo ? repliedTo.messageId : self.messageId,
    topicText,
    imageSources,
  };
}
