import { generateText, jsonSchema, Output } from "ai";
import { getV2DB } from "./db";
import {
  channelsWithPendingExtraction,
  getMessagesBefore,
  getUnextractedInChannel,
  guildsWithPendingExtraction,
  markExtracted,
  StoredMessage,
} from "./messages";
import { getAISettings, isLearningActive, MODELS, userAllowsLearning } from "./settings";
import { contentWords, normalizeWord } from "./text";
import { renderImages } from "./vision";
import { buildExtractionContext, chunkByConversation } from "./extractionContext";
import { createOpenRouter, computeCost, logAPICall } from "../utils/api/openrouter";

export const EXTRACTOR_VERSION = "v2.3";

export type FactKind = "self_report" | "third_party_claim" | "temporary_state" | "curated_seed";

export type Fact = {
  id: number;
  guildId: string;
  subjectUserId: string;
  predicate: string;
  value: string;
  kind: FactKind;
  multiValued: boolean;
  firstSeenAt: number;
  lastConfirmedAt: number;
  expiresAt: number | null;
  evidenceCount: number;
  reporters: string[];
  /** active | superseded | retracted (expired facts keep "active" but expiresAt < now) */
  status: string;
  /** Discord message IDs that prove this fact */
  sourceMessageIds: string[];
  category: string | null;
};

type FactRow = {
  id: number;
  guild_id: string;
  subject_user_id: string;
  predicate: string;
  value: string;
  kind: FactKind;
  multi_valued: number;
  first_seen_at: number;
  last_confirmed_at: number;
  expires_at: number | null;
  evidence_count: number;
  reporters: string | null;
  status: string;
  message_ids: string | null;
  category: string | null;
};

const DAY = 24 * 60 * 60 * 1000;

const FACT_SELECT = `
  SELECT f.*, COUNT(CASE WHEN e.evidence_type != 'context' THEN 1 END) AS evidence_count,
    GROUP_CONCAT(DISTINCT CASE WHEN e.evidence_type != 'context' THEN e.reporter_user_id END) AS reporters,
    GROUP_CONCAT(DISTINCT e.message_id) AS message_ids
  FROM facts f LEFT JOIN fact_evidence e ON e.fact_id = f.id`;

function fromRow(r: FactRow): Fact {
  return {
    id: r.id,
    guildId: r.guild_id,
    subjectUserId: r.subject_user_id,
    predicate: r.predicate,
    value: r.value,
    kind: r.kind,
    multiValued: r.multi_valued === 1,
    firstSeenAt: r.first_seen_at,
    lastConfirmedAt: r.last_confirmed_at,
    expiresAt: r.expires_at,
    evidenceCount: r.evidence_count,
    reporters: r.reporters ? r.reporters.split(",") : [],
    status: r.status,
    sourceMessageIds: r.message_ids ? r.message_ids.split(",") : [],
    category: r.category ?? null,
  };
}

export function getActiveFacts(guildId: string, subjectIds: string[]): Fact[] {
  if (subjectIds.length === 0) return [];
  const ph = subjectIds.map(() => "?").join(",");
  const rows = getV2DB()
    .prepare(
      `${FACT_SELECT}
       WHERE f.guild_id = ? AND f.subject_user_id IN (${ph}) AND f.status = 'active' AND f.kind != 'temporary_state'
         AND (f.expires_at IS NULL OR f.expires_at > ?)
       GROUP BY f.id ORDER BY f.last_confirmed_at DESC`
    )
    .all(guildId, ...subjectIds, Date.now()) as FactRow[];
  return rows.map(fromRow);
}

export type FactSource = {
  messageId: string;
  channelId: string | null;
  authorId: string;
  authorName: string | null;
  content: string | null;
  createdAt: number | null;
  quote: string;
  link: string | null;
};

export function jumpLink(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

/** The messages a fact was learned from, with jump links. */
export function getFactSources(guildId: string, factId: number): FactSource[] {
  const rows = getV2DB()
    .prepare(
      `SELECT e.message_id, e.reporter_user_id, e.evidence_quote, m.channel_id, m.author_name, m.content, m.created_at
       FROM fact_evidence e LEFT JOIN messages m ON m.guild_id = e.guild_id AND m.message_id = e.message_id
       WHERE e.guild_id = ? AND e.fact_id = ? ORDER BY m.created_at`
    )
    .all(guildId, factId) as {
    message_id: string;
    reporter_user_id: string;
    evidence_quote: string;
    channel_id: string | null;
    author_name: string | null;
    content: string | null;
    created_at: number | null;
  }[];
  return rows.map((r) => ({
    messageId: r.message_id,
    channelId: r.channel_id,
    authorId: r.reporter_user_id,
    authorName: r.author_name,
    content: r.content,
    createdAt: r.created_at,
    quote: r.evidence_quote,
    link: r.channel_id ? jumpLink(guildId, r.channel_id, r.message_id) : null,
  }));
}

/** Wipe everything learned in a guild and mark its messages for re-learning (backfill reset). */
export function resetGuildMemory(guildId: string): { facts: number; profiles: number; messages: number } {
  const db = getV2DB();
  let out = { facts: 0, profiles: 0, messages: 0 };
  db.transaction(() => {
    db.prepare("DELETE FROM fact_usage WHERE guild_id = ?").run(guildId);
    db.prepare("DELETE FROM fact_evidence WHERE guild_id = ?").run(guildId);
    out.facts = db.prepare("DELETE FROM facts WHERE guild_id = ?").run(guildId).changes;
    out.profiles = db.prepare("DELETE FROM user_profiles WHERE guild_id = ?").run(guildId).changes;
    out.messages = db
      .prepare("UPDATE messages SET extracted = 0 WHERE guild_id = ? AND is_own_bot = 0 AND deleted_at IS NULL")
      .run(guildId).changes;
  })();
  return out;
}

export function countGuildMemory(guildId: string): { facts: number; profiles: number } {
  const db = getV2DB();
  return {
    facts: (db.prepare("SELECT COUNT(*) AS c FROM facts WHERE guild_id = ?").get(guildId) as { c: number }).c,
    profiles: (db.prepare("SELECT COUNT(*) AS c FROM user_profiles WHERE guild_id = ? AND profile IS NOT NULL").get(guildId) as { c: number }).c,
  };
}

export function getFact(guildId: string, factId: number): Fact | null {
  const row = getV2DB()
    .prepare(`${FACT_SELECT} WHERE f.guild_id = ? AND f.id = ? GROUP BY f.id`)
    .get(guildId, factId) as FactRow | undefined;
  return row ? fromRow(row) : null;
}

export function forgetFact(guildId: string, factId: number): boolean {
  return getV2DB().prepare("DELETE FROM facts WHERE guild_id = ? AND id = ?").run(guildId, factId).changes > 0;
}

export function forgetAllAbout(guildId: string, userId: string): number {
  return getV2DB().prepare("DELETE FROM facts WHERE guild_id = ? AND subject_user_id = ?").run(guildId, userId).changes;
}

/**
 * A message was edited or deleted: drop its evidence and retract facts that no
 * longer have any support. Edited messages are re-extracted later.
 */
export function onEvidenceChanged(guildId: string, messageId: string): void {
  const db = getV2DB();
  db.transaction(() => {
    const factIds = (
      db.prepare("SELECT fact_id FROM fact_evidence WHERE guild_id = ? AND message_id = ?").all(guildId, messageId) as {
        fact_id: number;
      }[]
    ).map((r) => r.fact_id);
    db.prepare("DELETE FROM fact_evidence WHERE guild_id = ? AND message_id = ?").run(guildId, messageId);
    for (const id of factIds) {
      const left = (
        db.prepare("SELECT COUNT(*) AS c FROM fact_evidence WHERE fact_id = ? AND evidence_type != 'context'").get(id) as { c: number }
      ).c;
      if (left === 0) db.prepare("UPDATE facts SET status = 'retracted' WHERE id = ? AND source_kind = 'extracted'").run(id);
    }
  })();
}

// ---------------------------------------------------------------------------
// Retrieval with relevance gating and a repetition penalty
// ---------------------------------------------------------------------------

const ROAST_RE =
  /\b(roast|flame|insult|diss|cook|destroy|mock|bully|clown|ratio|humble|dunk|burn|rip into|clap|ether|violate|obliterate|zerstör|beleidig|fertig\s?mach)\w*/i;

export function isRoastRequest(instruction: string): boolean {
  return ROAST_RE.test(instruction);
}

/** `ammo`: picked as roast material about the target (not because it matches the topic). */
export type RankedFact = Fact & { relevance: number; ammo: boolean };

/** Few on purpose: more facts make the model list them instead of writing a joke. */
const ROAST_AMMO = 2;

function recentlyUsed(guildId: string, channelId: string): Set<number> {
  const rows = getV2DB()
    .prepare(
      `SELECT DISTINCT fact_id FROM fact_usage WHERE guild_id = ? AND channel_id = ? AND used_at > ?
       UNION SELECT fact_id FROM (SELECT fact_id FROM fact_usage WHERE guild_id = ? AND channel_id = ? ORDER BY used_at DESC LIMIT 10)`
    )
    .all(guildId, channelId, Date.now() - DAY, guildId, channelId) as { fact_id: number }[];
  return new Set(rows.map((r) => r.fact_id));
}

export function selectFactsForReply(
  guildId: string,
  channelId: string,
  subjectIds: string[],
  targetIds: string[],
  topicText: string,
  instruction: string
): RankedFact[] {
  const facts = getActiveFacts(guildId, subjectIds);
  if (facts.length === 0) return [];
  const topic = contentWords(topicText);
  const used = recentlyUsed(guildId, channelId);

  const scored = facts.map((f) => {
    const words = contentWords(`${f.predicate.replace(/_/g, " ")} ${f.value}`);
    let relevance = 0;
    for (const w of words) if (topic.has(w)) relevance++;
    let score = relevance * 2 + (f.kind === "self_report" ? 1 : f.kind === "curated_seed" ? 0.6 : 0.5);
    score += Math.min(f.evidenceCount, 3) * 0.2;
    if (used.has(f.id) && relevance < 2) score -= 3;
    return { ...f, relevance, score, ammo: false };
  });

  if (isRoastRequest(instruction)) {
    // Roast: hand over the target's best material. Topical facts first, then a
    // shuffled mix of the rest so repeated roasts don't reuse the same fact.
    const ammo = scored
      .filter((f) => targetIds.includes(f.subjectUserId))
      .map((f) => ({ ...f, rank: f.score + (f.relevance > 0 ? 5 : 0) + Math.random() * 1.5 }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, ROAST_AMMO)
      .map(({ rank, ...f }) => ({ ...f, ammo: true }));
    // Plus anything clearly on-topic about other people involved.
    const extra = scored
      .filter((f) => !targetIds.includes(f.subjectUserId) && f.relevance > 0 && f.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 1);
    return [...ammo, ...extra];
  }

  return scored.filter((f) => f.relevance > 0 && f.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
}

/** Record which supplied facts actually made it into the reply. */
export function recordFactUsage(guildId: string, channelId: string, facts: Fact[], reply: string): number[] {
  const replyWords = contentWords(reply);
  const usedIds: number[] = [];
  for (const f of facts) {
    const words = [...contentWords(f.value)];
    if (words.length > 0 && words.some((w) => replyWords.has(w))) usedIds.push(f.id);
  }
  const stmt = getV2DB().prepare("INSERT INTO fact_usage (fact_id, guild_id, channel_id, used_at) VALUES (?, ?, ?, ?)");
  const now = Date.now();
  for (const id of usedIds) stmt.run(id, guildId, channelId, now);
  return usedIds;
}

/**
 * Every fact ever learned about these users (current, replaced and expired),
 * optionally limited to facts stated within [from, to]. Newest first.
 */
export function getFactHistory(guildId: string, subjectIds: string[], from?: number, to?: number): Fact[] {
  if (subjectIds.length === 0) return [];
  const ph = subjectIds.map(() => "?").join(",");
  const rows = getV2DB()
    .prepare(
      `${FACT_SELECT}
       WHERE f.guild_id = ? AND f.subject_user_id IN (${ph}) AND f.status != 'retracted'
         AND f.last_confirmed_at >= ? AND f.first_seen_at <= ?
       GROUP BY f.id ORDER BY f.last_confirmed_at DESC`
    )
    .all(guildId, ...subjectIds, from ?? 0, to ?? Number.MAX_SAFE_INTEGER) as FactRow[];
  return rows.map(fromRow);
}

export function factIsCurrent(f: Fact, now = Date.now()): boolean {
  return f.status === "active" && (f.expiresAt == null || f.expiresAt > now);
}

export function searchFacts(
  guildId: string,
  subjectIds: string[],
  query: string,
  limit = 8,
  opts: { history?: boolean; from?: number; to?: number } = {}
): Fact[] {
  const facts =
    opts.history || opts.from != null || opts.to != null
      ? getFactHistory(guildId, subjectIds, opts.from, opts.to)
      : getActiveFacts(guildId, subjectIds);
  const q = contentWords(query);
  if (q.size === 0) return facts.slice(0, limit);
  return facts
    .map((f) => {
      const words = contentWords(`${f.predicate.replace(/_/g, " ")} ${f.value}`);
      let s = 0;
      for (const w of words) if (q.has(w)) s++;
      return { f, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.f);
}

// ---------------------------------------------------------------------------
// Background extraction
// ---------------------------------------------------------------------------

type Candidate = {
  source_ref: string;
  subject_user_id: string;
  predicate: string;
  value: string;
  classification: "self_report" | "third_party_claim" | "joke" | "temporary_state" | "correction";
  category: string;
  confidence: "high" | "medium" | "low";
  /** ref of a message that gives the source its meaning (what it replies to / agrees with), or null */
  context_ref: string | null;
  multi_valued: boolean;
  evidence_quote: string;
  supersedes_fact_id: number | null;
};

/** The only kinds of facts that are kept: things that describe who someone is. */
export const FACT_CATEGORIES = [
  "identity",
  "work_or_school",
  "location",
  "game",
  "skill_or_rank",
  "hobby",
  "taste",
  "habit",
  "personality",
  "possession",
  "relationship",
  "reputation",
] as const;

/** Plans, intentions and time-bound statements are never facts, whatever the model says. */
const TEMPORAL_VALUE_RE =
  /\b(plan(s|ned|ning)?|going to|gonna|will|wants? to|wanted to|wanna|would like|hop(e|es|ing) to|tomorrow|tonight|today|yesterday|next (week|month|year|weekend|time)|this (week|month|year|weekend|morning|evening)|last (week|month|night|weekend)|later|soon|currently|right now|at the moment|recently|considering|thinking (about|of)|might|maybe|about to|upcoming|deadline|appointment|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;
const TEMPORAL_QUOTE_RE =
  /\b(plan(s|ned|ning)?|going to|gonna|wanna|tomorrow|tonight|next (week|month|year|weekend)|this (week|weekend)|considering|thinking about|about to)\b/i;

export function looksTemporal(value: string, quote: string): boolean {
  return TEMPORAL_VALUE_RE.test(value) || TEMPORAL_QUOTE_RE.test(quote);
}

const candidateSchema = jsonSchema<{ facts: Candidate[] }>({
  type: "object",
  additionalProperties: false,
  required: ["facts"],
  properties: {
    facts: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "source_ref",
          "subject_user_id",
          "predicate",
          "value",
          "classification",
          "category",
          "confidence",
          "context_ref",
          "multi_valued",
          "evidence_quote",
          "supersedes_fact_id",
        ],
        properties: {
          source_ref: { type: "string", description: "ref of the message that states the fact, e.g. m4" },
          subject_user_id: { type: "string", description: "Discord user ID the fact is about" },
          predicate: { type: "string", description: "short snake_case relation, e.g. owns_gpu, plays_game, job, likes" },
          value: { type: "string" },
          classification: {
            type: "string",
            enum: ["self_report", "third_party_claim", "joke", "temporary_state", "correction"],
          },
          category: { type: "string", enum: FACT_CATEGORIES as unknown as string[] },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "high only if you'd bet it is true, lasting and about this person; only high facts are kept",
          },
          context_ref: {
            type: ["string", "null"],
            description: "ref of the message that gives the source its meaning (the message it replies to or agrees with), else null",
          },
          multi_valued: { type: "boolean", description: "true if a person can have several values (likes, owns)" },
          evidence_quote: { type: "string", description: "exact substring of the source message" },
          supersedes_fact_id: { type: ["integer", "null"], description: "id of a known fact this replaces, or null" },
        },
      },
    },
  },
});

const EXTRACTOR_SYSTEM = `You build profiles of members of a Discord friend group by extracting lasting facts about WHO THEY ARE from chat. A sarcastic bot later uses these profiles to talk to and roast them.

Rules:
- Only extract facts stated in messages marked [EXTRACT]. [CONTEXT] messages are only there to resolve references.
- Every fact needs: the source message ref, the Discord user ID it is ABOUT, a category, a snake_case predicate, a value, and an exact quote copied from the source message.
- The subject must be a user ID that appears in the log (the author, someone they mention, reply to, or a name annotated with [= ... user ID]). Never guess IDs.

Only extract facts that describe the person in a lasting way, in one of these categories:
- identity: age group, nationality, languages, background
- work_or_school: job, field, studies
- location: where they live (city/country), not where they are right now
- game: games they play a lot, mains, platforms
- skill_or_rank: ranks, skill level, what they're good or bad at
- hobby: hobbies, sports, instruments, creative stuff
- taste: stable likes and dislikes (music, anime, food, media they love or hate)
- habit: recurring behavior (sleep schedule, always late, energy drinks, hours played)
- personality: traits they show or admit (rage-quits, competitive, lazy)
- possession: defining things they own (PC setup, car, pet)
- relationship: relationships within the group (best friends, rivals, roommates)
- reputation: what the group consistently says or jokes about them

How to read the log:
- Lines are in chat order with the time of day. [CONTEXT] = earlier messages of the same conversation. [REPLIED] = older messages that someone in the batch replied to. [EXTRACT] = the messages you extract from. [AFTER] = how people reacted right after.
- "(reply to m4 by Name)" means that line is a Discord reply to m4. Read every [EXTRACT] message in its conversation: which question it answers, what it agrees or disagrees with, who it is aimed at.
- A short reply can carry a fact through what it replies to: B "I sleep at 4am every day" -> A replies "same" means A sleeps very late. Then quote the [EXTRACT] message and set context_ref to the message that gives it meaning.
- Use the reactions around a message: if people laugh, mock it or it's obvious bait, it is a joke, not a fact.
- confidence: "high" only when you would bet that the fact is true, lasting and about this person. Only high-confidence facts are kept, so don't inflate.

The bar is high: would this still be true and worth knowing about them in a month? If not, skip it.
NEVER extract:
- plans, intentions, wishes, considerations ("going to", "want to", "thinking about", "might", "planning")
- anything temporary or dated: moods, being sick, today/this week/currently, where they are right now, schedules, events, deadlines
- one-off actions and trivia ("watched a video", "had pizza", "considered writing a plugin")
- passing opinions about one thing, questions, greetings, anything about the bot
Values never contain dates or relative times. Write the lasting version ("plays bass", "mains Yasuo", "hardstuck silver").

classification:
- self_report: the author states something about themself ("I main Yasuo").
- third_party_claim: the author states something about someone else ("Alice is hardstuck gold"). The subject is the other person.
- correction: the author corrects an earlier fact about themself ("sold the 4070, have a 5070 now"). Set supersedes_fact_id when a known fact is replaced.
- joke: sarcasm, irony, hyperbole, memes, roleplay ("I'm literally a toaster"). When unsure, use joke.
- (temporary_state exists only for compatibility. Never use it.)

- Quoting someone else ("Bob said 'I bought a 4090'") is NOT a self-report by the author.
- Reuse predicates from the known facts list when the meaning matches.
- "[image: Shows: ... | Used as: ...]" is an automatic description of an image the author posted and its role in the chat.
  Reaction images and memes ("Used as: reaction to ...") show how someone reacts; they are never facts about the poster, but they help you read the conversation (who is mocked, what is agreed with).
  Only extract a fact from an image when it is the author's own photo/screenshot AND their text claims it ("my new setup", "finally hit diamond"); then the quote may come from the description.
  A text message that replies to an image is a comment on that image: read it together with the image description.
- Most batches contain zero facts, and that is fine. Return {"facts": []} when nothing clears the bar.`;

function normalizeQuote(s: string): string {
  return s
    .split(/\s+/)
    .map(normalizeWord)
    .join(" ")
    .trim();
}

const FIRST_PERSON = /(^|[^\p{L}])(i|i'm|im|my|mine|me|ich|mein|meine|meinen|meinem|mir|mich)(?=$|[^\p{L}])/iu;

export type ExtractionBatch = {
  guildId: string;
  /** earlier messages of the same conversation */
  context: StoredMessage[];
  batch: StoredMessage[];
  /** older messages that batch messages replied to */
  parents?: StoredMessage[];
  /** reactions right after the batch */
  after?: StoredMessage[];
  /** backfill jobs run even while the guild still uses the legacy engine */
  backfill?: boolean;
};

export type ExtractionStats = { stored: number; cost: number; calls: number };

export function validateCandidates(
  guildId: string,
  candidates: Candidate[],
  refToMessage: Map<string, StoredMessage>,
  batchRefs: Set<string>,
  knownFacts: Map<number, Fact>
): (Candidate & { message: StoredMessage; kind: FactKind; contextMessage?: StoredMessage })[] {
  const out: (Candidate & { message: StoredMessage; kind: FactKind; contextMessage?: StoredMessage })[] = [];
  for (const c of candidates) {
    if (!batchRefs.has(c.source_ref)) continue;
    const message = refToMessage.get(c.source_ref);
    if (!message || message.isOwnBot) continue;
    if (c.classification === "joke") continue;
    // Only facts the extractor would bet on. (Missing field = older test data/models: treat as high.)
    if (c.confidence && c.confidence !== "high") continue;
    // No temporary or time-bound facts at all, only profile categories.
    if (c.classification === "temporary_state") continue;
    if (!(FACT_CATEGORIES as readonly string[]).includes(c.category)) continue;
    if (looksTemporal(c.value ?? "", c.evidence_quote ?? "")) continue;

    const allowedSubjects = new Set<string>([message.authorId, ...message.mentionedUserIds]);
    message.nameRefs.forEach((r) => r.confidence === "high" && r.userId && allowedSubjects.add(r.userId));
    if (message.replyToMessageId) {
      const parent = [...refToMessage.values()].find((m) => m.messageId === message.replyToMessageId);
      if (parent && !parent.isOwnBot) allowedSubjects.add(parent.authorId);
    }
    if (!/^\d{15,22}$/.test(c.subject_user_id) || !allowedSubjects.has(c.subject_user_id)) continue;

    const quote = normalizeQuote(c.evidence_quote);
    if (quote.length < 3) continue;
    const inText = normalizeQuote(message.content).includes(quote);
    const inCaption =
      !inText && message.images.some((i) => i.state === "done" && i.caption && normalizeQuote(i.caption).includes(quote));
    if (!inText && !inCaption) continue;
    // An image only says something about the poster if their own words claim it.
    if (inCaption && (c.subject_user_id !== message.authorId || !FIRST_PERSON.test(message.content))) continue;

    const predicate = c.predicate.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    const value = c.value.trim().slice(0, 200);
    if (!predicate || !value) continue;

    const aboutSelf = c.subject_user_id === message.authorId;
    let kind: FactKind;
    if (c.classification === "third_party_claim" || !aboutSelf) {
      kind = "third_party_claim";
    } else {
      kind = "self_report";
    }

    if (!userAllowsLearning(guildId, message.authorId) || !userAllowsLearning(guildId, c.subject_user_id)) continue;

    let supersedes = c.supersedes_fact_id;
    if (supersedes != null) {
      const old = knownFacts.get(supersedes);
      // Only the subject themself can replace a fact; hearsay never overwrites.
      if (!old || old.subjectUserId !== c.subject_user_id || kind !== "self_report") supersedes = null;
    }

    const ctxMsg = c.context_ref ? refToMessage.get(c.context_ref) : undefined;
    const contextMessage = ctxMsg && ctxMsg.messageId !== message.messageId && !ctxMsg.isOwnBot ? ctxMsg : undefined;

    out.push({ ...c, predicate, value, supersedes_fact_id: supersedes, message, kind, contextMessage });
  }
  return out;
}

export function storeValidatedFacts(guildId: string, facts: ReturnType<typeof validateCandidates>): number {
  const db = getV2DB();
  let stored = 0;
  // Oldest statements first, so "later wins" holds within one batch too.
  const ordered = [...facts].sort((a, b) => a.message.createdAt - b.message.createdAt);
  db.transaction(() => {
    for (const f of ordered) {
      // A fact's time is when it was SAID, not when we processed it (matters for /backfill).
      const saidAt = f.message.createdAt;
      const key = `${f.predicate}:${normalizeQuote(f.value)}`;
      const existing = db
        .prepare(
          "SELECT id, kind FROM facts WHERE guild_id = ? AND subject_user_id = ? AND normalized_key = ? AND status = 'active'"
        )
        .get(guildId, f.subject_user_id, key) as { id: number; kind: FactKind } | undefined;

      let factId: number;
      if (existing) {
        factId = existing.id;
        const upgrade = existing.kind === "third_party_claim" && f.kind === "self_report";
        db.prepare(
          `UPDATE facts SET
             first_seen_at = MIN(first_seen_at, ?),
             last_confirmed_at = MAX(last_confirmed_at, ?),
             kind = CASE WHEN ? THEN 'self_report' ELSE kind END,
             expires_at = CASE WHEN ? THEN NULL
                               WHEN expires_at IS NULL THEN NULL
                               ELSE MAX(expires_at, ?) END
           WHERE id = ?`
        ).run(saidAt, saidAt, upgrade ? 1 : 0, upgrade ? 1 : 0, saidAt + ttlFor(f.kind), factId);
      } else {
        const ttl = ttlFor(f.kind);
        const expires = ttl > 0 ? saidAt + ttl : null;

        // Single-valued self-reports: the most recently SAID value wins, whatever the processing order.
        let status: "active" | "superseded" = "active";
        let supersedesId = f.supersedes_fact_id;
        if (f.kind === "self_report" && !f.multi_valued) {
          const newer = db
            .prepare(
              `SELECT id FROM facts WHERE guild_id = ? AND subject_user_id = ? AND predicate = ? AND status = 'active'
                 AND multi_valued = 0 AND kind = 'self_report' AND last_confirmed_at > ? LIMIT 1`
            )
            .get(guildId, f.subject_user_id, f.predicate, saidAt) as { id: number } | undefined;
          if (newer) {
            status = "superseded"; // an older statement arriving late (e.g. backfill)
            supersedesId = null;
          }
        }
        if (supersedesId != null) {
          const target = db.prepare("SELECT last_confirmed_at FROM facts WHERE guild_id = ? AND id = ?").get(guildId, supersedesId) as
            | { last_confirmed_at: number }
            | undefined;
          if (!target || target.last_confirmed_at > saidAt) supersedesId = null;
        }

        factId = Number(
          db
            .prepare(
              `INSERT INTO facts (guild_id, subject_user_id, predicate, value, normalized_key, multi_valued, kind, status,
                 source_kind, first_seen_at, last_confirmed_at, expires_at, supersedes_fact_id, extractor_version, category)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'extracted', ?, ?, ?, ?, ?, ?)`
            )
            .run(
              guildId,
              f.subject_user_id,
              f.predicate,
              f.value,
              key,
              f.multi_valued ? 1 : 0,
              f.kind,
              status,
              saidAt,
              saidAt,
              expires,
              supersedesId,
              EXTRACTOR_VERSION,
              f.category ?? null
            ).lastInsertRowid
        );
        stored++;

        if (status === "active") {
          if (f.kind === "self_report" && !f.multi_valued) {
            db.prepare(
              `UPDATE facts SET status = 'superseded' WHERE guild_id = ? AND subject_user_id = ? AND predicate = ?
                 AND id != ? AND status = 'active' AND multi_valued = 0 AND last_confirmed_at <= ?`
            ).run(guildId, f.subject_user_id, f.predicate, factId, saidAt);
          }
          if (supersedesId != null) {
            db.prepare("UPDATE facts SET status = 'superseded' WHERE guild_id = ? AND id = ?").run(guildId, supersedesId);
          }
        }
      }

      db.prepare(
        `INSERT OR IGNORE INTO fact_evidence (fact_id, guild_id, message_id, message_revision, reporter_user_id, evidence_quote, evidence_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(factId, guildId, f.message.messageId, f.message.revision, f.message.authorId, f.evidence_quote.slice(0, 300), f.kind);
      if (f.contextMessage) {
        db.prepare(
          `INSERT OR IGNORE INTO fact_evidence (fact_id, guild_id, message_id, message_revision, reporter_user_id, evidence_quote, evidence_type)
           VALUES (?, ?, ?, ?, ?, ?, 'context')`
        ).run(factId, guildId, f.contextMessage.messageId, f.contextMessage.revision, f.contextMessage.authorId, f.contextMessage.content.slice(0, 300));
      }
      touchedSubjects.add(`${guildId}:${f.subject_user_id}`);
    }
  })();
  return stored;
}

/** Facts never expire. They only end when replaced by a newer statement, forgotten, or their source is deleted. */
function ttlFor(_kind: FactKind): number {
  return 0;
}

/** guild:user pairs whose facts changed since the last drain (drives profile refreshes). */
const touchedSubjects = new Set<string>();
export function drainTouchedSubjects(): { guildId: string; userId: string }[] {
  const out = [...touchedSubjects].map((k) => {
    const [guildId, userId] = k.split(":");
    return { guildId, userId };
  });
  touchedSubjects.clear();
  return out;
}

/**
 * Cheap pre-filter so "lol", emoji spam and bare links never cost an extractor
 * call. Such messages are still passed along as context.
 */
export function isWorthExtracting(content: string, isReply = false): boolean {
  const text = content
    .replace(/<a?:\w+:\d+>/g, " ")
    .replace(/<[@#][!&]?\d+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[(attachment|sticker): [^\]]*\]/g, " ")
    .trim();
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const joined = words.join("").toLowerCase();
  // Laughter and reactions never carry a fact.
  if (/^(l+o+l+|lmf?a+o+|xd+|(ha)+h?|(he)+h?|kek|bruh|gg|wtf|omg|rip|f|lul|kekw|w|l|💀)$/i.test(joined)) return false;
  // Short replies ("same", "me too", "yes" to a question) get their meaning from what they reply to.
  if (isReply) return words.length >= 1 && text.length >= 2;
  if (words.length < 2 || text.length < 6) return false;
  if (/^(ok+|okay|yes|no|nah|yeah)$/i.test(joined)) return false;
  return true;
}

/** Whether a stored message is worth sending to the extractor at all. */
export function isExtractable(m: StoredMessage): boolean {
  return !m.isOwnBot && isWorthExtracting(m.content, !!m.replyToMessageId);
}

type ExtractorTag = "EXTRACT" | "CONTEXT" | "REPLIED" | "AFTER";

const timeOfDay = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: process.env.BOT_TIMEZONE || "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(ms)
  );

function renderForExtractor(
  m: StoredMessage,
  ref: string,
  tag: ExtractorTag,
  refOf: Map<string, string>,
  byId: Map<string, StoredMessage>
): string {
  let text = m.content;
  for (const r of [...m.nameRefs].filter((r) => r.confidence === "high" && r.userId).sort((a, b) => b.start - a.start)) {
    text = text.slice(0, r.end) + ` [= user ${r.userId}]` + text.slice(r.end);
  }
  text = text.replace(/<@!?(\d+)>/g, "@[user $1]");
  if (m.images.length) text = `${text} ${renderImages(m.images)}`.trim();
  let reply = "";
  if (m.replyToMessageId) {
    const parent = byId.get(m.replyToMessageId);
    reply = parent
      ? ` (reply to ${refOf.get(parent.messageId)} by ${parent.isOwnBot ? "BOT" : `${parent.authorName} [user ${parent.authorId}]`})`
      : " (reply to a message that isn't available)";
  }
  const who = m.isOwnBot ? "BOT" : `${m.authorName} [user ${m.authorId}]`;
  return `[${tag}] ${ref} ${timeOfDay(m.createdAt)} ${who}${reply}: ${text}`;
}

let extractorModelForTests: ((prompt: string) => Promise<{ facts?: Candidate[] }>) | null = null;

/** Test hook: see the exact prompt and return canned output instead of calling the model. */
export function _setExtractorModelForTests(fn?: (prompt: string) => Promise<{ facts?: any[] }>): void {
  extractorModelForTests = (fn as any) ?? null;
}

async function extractBatch(job: ExtractionBatch): Promise<ExtractionStats> {
  const { guildId, batch } = job;
  // Everything before the batch, in chat order: replied-to messages and the conversation so far.
  const context = [...(job.parents ?? []), ...job.context].sort((a, b) => a.createdAt - b.createdAt);
  const parentIds = new Set((job.parents ?? []).map((m) => m.messageId));
  const after = job.after ?? [];
  const refOf = new Map<string, string>();
  const refToMessage = new Map<string, StoredMessage>();
  const byId = new Map<string, StoredMessage>();
  [...context, ...batch, ...after].forEach((m, i) => {
    refOf.set(m.messageId, `m${i + 1}`);
    refToMessage.set(`m${i + 1}`, m);
    byId.set(m.messageId, m);
  });
  const evidenceIds = batch
    .filter((m) => isExtractable(m) && userAllowsLearning(guildId, m.authorId))
    .map((m) => m.messageId);
  const batchRefs = new Set(evidenceIds.map((id) => refOf.get(id)!));
  const done = batch.map((m) => ({ messageId: m.messageId, revision: m.revision }));

  if (batchRefs.size === 0) {
    markExtracted(guildId, done);
    return { stored: 0, cost: 0, calls: 0 };
  }

  const subjects = new Set<string>();
  for (const m of [...context, ...batch, ...after]) {
    subjects.add(m.authorId);
    m.mentionedUserIds.forEach((id) => subjects.add(id));
    m.nameRefs.forEach((r) => r.userId && subjects.add(r.userId));
  }
  const known = getActiveFacts(guildId, [...subjects]).slice(0, 60);
  const knownById = new Map(known.map((f) => [f.id, f]));

  const log = [
    ...context.map((m) => renderForExtractor(m, refOf.get(m.messageId)!, parentIds.has(m.messageId) ? "REPLIED" : "CONTEXT", refOf, byId)),
    ...batch.map((m) =>
      renderForExtractor(m, refOf.get(m.messageId)!, batchRefs.has(refOf.get(m.messageId)!) ? "EXTRACT" : "CONTEXT", refOf, byId)
    ),
    ...after.map((m) => renderForExtractor(m, refOf.get(m.messageId)!, "AFTER", refOf, byId)),
  ].join("\n");
  const knownText = known.length
    ? known.map((f) => `#${f.id} user ${f.subjectUserId}: ${f.predicate} = ${f.value} (${f.kind})`).join("\n")
    : "(none)";

  const start = Date.now();
  const prompt = `<known_facts>\n${knownText}\n</known_facts>\n\n<chat_log>\n${log}\n</chat_log>`;
  let output: { facts?: Candidate[] } | undefined;
  let usage = { inputTokens: 0, outputTokens: 0 } as { inputTokens?: number; outputTokens?: number };
  if (extractorModelForTests) {
    output = await extractorModelForTests(prompt);
  } else {
    const result = await generateText({
      model: createOpenRouter().chat(MODELS.extract),
      system: EXTRACTOR_SYSTEM,
      prompt,
      output: Output.object({ schema: candidateSchema }),
      maxRetries: 1,
      timeout: 60_000,
    });
    output = (result as any).output as { facts?: Candidate[] } | undefined;
    usage = result.totalUsage;
  }

  const candidates = (output?.facts ?? []) as Candidate[];
  const valid = validateCandidates(guildId, candidates, refToMessage, batchRefs, knownById);
  // Learning may have been switched off while the model was running.
  const allowed = job.backfill ? getAISettings(guildId).learning : isLearningActive(guildId);
  const stored = allowed ? storeValidatedFacts(guildId, valid) : 0;
  markExtracted(guildId, done);

  const cost = computeCost(MODELS.extract, usage.inputTokens || 0, usage.outputTokens || 0);
  logAPICall({
    type: "MemoryV2.extract",
    model: MODELS.extract,
    inputTokens: usage.inputTokens || 0,
    outputTokens: usage.outputTokens || 0,
    cost: cost.toFixed(6),
    durationMs: Date.now() - start,
    extra: { messages: batch.length, candidates: candidates.length, valid: valid.length, stored, backfill: !!job.backfill },
  });
  return { stored, cost, calls: 1 };
}

const BATCH_SIZE = 25;
/** Wait this long after the last message in a channel, to batch a burst into one call. */
const DEBOUNCE_MS = 2_000;
/** ...but never longer than this after the first unprocessed message. */
const MAX_WAIT_MS = 8_000;
/** Safety-net sweep for anything missed (restarts, failures). */
const SWEEP_INTERVAL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;
const CAPTION_WAIT_MS = 45_000;

type ChannelState = { timer: NodeJS.Timeout | null; firstAt: number; running: boolean; again: boolean };
const channelStates = new Map<string, ChannelState>();
const failures = new Map<string, number>(); // first message id of a batch -> failed attempts
let sweepTimer: NodeJS.Timeout | null = null;

function sinceFor(guildId: string): number {
  return Math.max(getAISettings(guildId).engineEnabledAt ?? 0, Date.now() - DAY);
}

async function extractChannel(guildId: string, channelId: string): Promise<void> {
  if (!isLearningActive(guildId)) return;
  let pending = getUnextractedInChannel(guildId, channelId, sinceFor(guildId), 200);
  // Wait for image captions (up to 45s) so facts like "my new setup" + photo are understood.
  // Stop at the first such message to keep order; captioning re-triggers extraction.
  const waitIdx = pending.findIndex((m) => m.images.some((i) => i.state === "pending") && Date.now() - m.createdAt < CAPTION_WAIT_MS);
  if (waitIdx >= 0) pending = pending.slice(0, waitIdx);
  for (const batch of chunkByConversation(pending, BATCH_SIZE)) {
    const ctx = buildExtractionContext(guildId, channelId, batch);
    const key = batch[0].messageId;
    try {
      await runBatch({ guildId, context: ctx.before, parents: ctx.parents, after: ctx.after, batch });
      failures.delete(key);
    } catch (err) {
      const attempts = (failures.get(key) ?? 0) + 1;
      failures.set(key, attempts);
      console.error(`[MemoryV2] Extraction batch failed (attempt ${attempts}/${MAX_ATTEMPTS}):`, (err as Error).message);
      if (attempts >= MAX_ATTEMPTS) {
        // Give up on this batch instead of paying for it forever.
        markExtracted(guildId, batch.map((m) => ({ messageId: m.messageId, revision: m.revision })));
        failures.delete(key);
      }
      return; // keep order: later batches wait for the next run
    }
  }
}

/**
 * Called right after a message is stored. Extraction starts DEBOUNCE_MS after
 * the channel goes quiet (at most MAX_WAIT_MS after the first new message),
 * so facts are usually remembered within a few seconds.
 */
export function scheduleExtraction(guildId: string, channelId: string): void {
  if (!isLearningActive(guildId)) return;
  const key = `${guildId}:${channelId}`;
  let st = channelStates.get(key);
  if (!st) {
    st = { timer: null, firstAt: 0, running: false, again: false };
    channelStates.set(key, st);
  }
  if (st.running) {
    st.again = true; // pick the new messages up as soon as the current run ends
    return;
  }
  const now = Date.now();
  if (st.timer) clearTimeout(st.timer);
  else st.firstAt = now;
  const wait = Math.max(0, Math.min(DEBOUNCE_MS, st.firstAt + MAX_WAIT_MS - now));
  st.timer = setTimeout(() => void flushChannel(guildId, channelId), wait);
}

async function flushChannel(guildId: string, channelId: string): Promise<void> {
  const key = `${guildId}:${channelId}`;
  const st = channelStates.get(key);
  if (!st) return;
  st.timer = null;
  st.running = true;
  try {
    await extractChannel(guildId, channelId);
  } catch (err) {
    console.error("[MemoryV2] Extraction error:", err);
  } finally {
    st.running = false;
    if (st.again) {
      st.again = false;
      scheduleExtraction(guildId, channelId);
    } else {
      channelStates.delete(key);
    }
  }
}

/** Safety net: schedule every channel that still has unprocessed messages. */
export function runExtractionSweep(): void {
  for (const guildId of guildsWithPendingExtraction()) {
    if (!isLearningActive(guildId)) continue;
    for (const channelId of channelsWithPendingExtraction(guildId, sinceFor(guildId))) {
      if (!channelStates.has(`${guildId}:${channelId}`)) scheduleExtraction(guildId, channelId);
    }
  }
}

export function startExtractionWorker(): void {
  if (sweepTimer) return;
  runExtractionSweep(); // catch up on anything left from before a restart
  sweepTimer = setInterval(() => {
    try {
      runExtractionSweep();
    } catch (err) {
      console.error("[MemoryV2] Extraction sweep error:", err);
    }
  }, SWEEP_INTERVAL_MS);
}

let runBatch: (job: ExtractionBatch) => Promise<ExtractionStats | void> = extractBatch;

/** Test hook: replace the model call (pass nothing to restore it). */
export function _setBatchRunnerForTests(fn?: (job: ExtractionBatch) => Promise<ExtractionStats | void>): void {
  runBatch = fn ?? extractBatch;
}

/** One extraction call (used by backfill). */
export async function runExtractionBatch(job: ExtractionBatch): Promise<ExtractionStats> {
  const stats = (await runBatch(job)) as ExtractionStats | undefined;
  return stats ?? { stored: 0, cost: 0, calls: 1 };
}

export const EXTRACTION_BATCH_SIZE = BATCH_SIZE;
