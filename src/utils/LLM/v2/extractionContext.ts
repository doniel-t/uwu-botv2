import { getMessage, getMessagesAfter, getMessagesBefore, StoredMessage } from "./messages";

/**
 * Context for fact extraction: the extractor reads each message inside its
 * conversation, not in isolation.
 *
 *  - Batches never span two conversations: a gap of CONVERSATION_GAP_MS in a
 *    channel starts a new one.
 *  - [CONTEXT]: earlier messages of the same conversation, going back at most
 *    CONTEXT_WINDOW_MS / MAX_CONTEXT_MESSAGES and stopping at the first gap.
 *  - [REPLIED]: messages someone in the batch replied to that are older than
 *    that window (up to REPLY_DEPTH levels), with author, no matter their age.
 *  - [AFTER]: how people reacted right after the batch (jokes, contradictions).
 */
export const CONVERSATION_GAP_MS = 20 * 60_000;
export const CONTEXT_WINDOW_MS = 45 * 60_000;
export const MAX_CONTEXT_MESSAGES = 40;
export const REPLY_DEPTH = 2;
export const AFTER_WINDOW_MS = 5 * 60_000;
export const AFTER_MAX = 6;

/** Split time-ordered messages into batches that never cross a conversation gap. */
export function chunkByConversation(messages: StoredMessage[], maxSize: number, gapMs = CONVERSATION_GAP_MS): StoredMessage[][] {
  const out: StoredMessage[][] = [];
  let current: StoredMessage[] = [];
  for (const m of messages) {
    const prev = current[current.length - 1];
    if (current.length > 0 && (current.length >= maxSize || m.createdAt - prev.createdAt > gapMs)) {
      out.push(current);
      current = [];
    }
    current.push(m);
  }
  if (current.length) out.push(current);
  return out;
}

export type ExtractionContext = { before: StoredMessage[]; parents: StoredMessage[]; after: StoredMessage[] };

export function buildExtractionContext(guildId: string, channelId: string, batch: StoredMessage[]): ExtractionContext {
  if (batch.length === 0) return { before: [], parents: [], after: [] };
  const first = batch[0];
  const last = batch[batch.length - 1];

  // Same conversation, walking backwards until a gap or the window ends.
  const candidates = getMessagesBefore(guildId, channelId, first.createdAt, MAX_CONTEXT_MESSAGES).filter(
    (m) => m.createdAt >= first.createdAt - CONTEXT_WINDOW_MS
  );
  const before: StoredMessage[] = [];
  let next = first.createdAt;
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (next - candidates[i].createdAt > CONVERSATION_GAP_MS) break;
    before.unshift(candidates[i]);
    next = candidates[i].createdAt;
  }

  // Replied-to messages outside that window, a couple of levels up.
  const known = new Set([...before, ...batch].map((m) => m.messageId));
  const parents: StoredMessage[] = [];
  for (const m of batch) {
    let parentId = m.replyToMessageId;
    for (let depth = 0; parentId && depth < REPLY_DEPTH; depth++) {
      if (known.has(parentId)) break;
      const parent = getMessage(guildId, parentId);
      if (!parent || parent.deletedAt) break;
      parents.push(parent);
      known.add(parent.messageId);
      parentId = parent.replyToMessageId;
    }
  }
  parents.sort((a, b) => a.createdAt - b.createdAt);

  const after = getMessagesAfter(guildId, channelId, last.createdAt, AFTER_MAX).filter(
    (m) => m.createdAt - last.createdAt <= AFTER_WINDOW_MS && !known.has(m.messageId)
  );
  return { before, parents, after };
}
