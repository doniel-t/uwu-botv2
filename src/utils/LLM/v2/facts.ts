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
import { createOpenRouter, computeCost, logAPICall } from "../utils/api/openrouter";

export const EXTRACTOR_VERSION = "v2.1";

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
};

const DAY = 24 * 60 * 60 * 1000;
const TEMP_STATE_TTL = 3 * DAY;
const HEARSAY_TTL = 90 * DAY;

const FACT_SELECT = `
  SELECT f.*, COUNT(e.message_id) AS evidence_count, GROUP_CONCAT(DISTINCT e.reporter_user_id) AS reporters
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
  };
}

export function getActiveFacts(guildId: string, subjectIds: string[]): Fact[] {
  if (subjectIds.length === 0) return [];
  const ph = subjectIds.map(() => "?").join(",");
  const rows = getV2DB()
    .prepare(
      `${FACT_SELECT}
       WHERE f.guild_id = ? AND f.subject_user_id IN (${ph}) AND f.status = 'active'
         AND (f.expires_at IS NULL OR f.expires_at > ?)
       GROUP BY f.id ORDER BY f.last_confirmed_at DESC`
    )
    .all(guildId, ...subjectIds, Date.now()) as FactRow[];
  return rows.map(fromRow);
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
      const left = (db.prepare("SELECT COUNT(*) AS c FROM fact_evidence WHERE fact_id = ?").get(id) as { c: number }).c;
      if (left === 0) db.prepare("UPDATE facts SET status = 'retracted' WHERE id = ? AND source_kind = 'extracted'").run(id);
    }
  })();
}

// ---------------------------------------------------------------------------
// Retrieval with relevance gating and a repetition penalty
// ---------------------------------------------------------------------------

const ROAST_RE = /\b(roast|flame|insult|diss|cook|destroy|mock|bully|clown|ratio)\w*/i;

export type RankedFact = Fact & { relevance: number; background: boolean };

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
    let score = relevance * 2 + (f.kind === "self_report" ? 1 : f.kind === "curated_seed" ? 0.6 : 0.3);
    score += Math.min(f.evidenceCount, 3) * 0.2;
    if (used.has(f.id) && relevance < 2) score -= 3;
    return { ...f, relevance, score, background: false };
  });

  const relevant = scored.filter((f) => f.relevance > 0 && f.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  if (relevant.length > 0) return relevant;

  // A roast with nothing topical may get ONE optional callback about the target.
  if (!ROAST_RE.test(instruction)) return [];
  const callback = scored
    .filter((f) => targetIds.includes(f.subjectUserId) && !used.has(f.id) && f.kind !== "temporary_state")
    .sort((a, b) => b.score - a.score + (Math.random() - 0.5))[0];
  return callback ? [{ ...callback, background: true }] : [];
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

export function searchFacts(guildId: string, subjectIds: string[], query: string, limit = 8): Fact[] {
  const facts = getActiveFacts(guildId, subjectIds);
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
  multi_valued: boolean;
  evidence_quote: string;
  supersedes_fact_id: number | null;
};

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
          multi_valued: { type: "boolean", description: "true if a person can have several values (likes, owns)" },
          evidence_quote: { type: "string", description: "exact substring of the source message" },
          supersedes_fact_id: { type: ["integer", "null"], description: "id of a known fact this replaces, or null" },
        },
      },
    },
  },
});

const EXTRACTOR_SYSTEM = `You extract durable personal facts about members of a Discord server from chat logs.

Rules:
- Only extract facts stated in messages marked [EXTRACT]. [CONTEXT] messages are only there to resolve references.
- Every fact needs: the source message ref, the Discord user ID it is ABOUT, a snake_case predicate, a value, and an exact quote copied from the source message.
- The subject must be a user ID that appears in the log (the author, someone they mention, reply to, or a name annotated with [= ... user ID]). Never guess IDs.
- classification:
  - self_report: the author states something about themself ("I bought a 4070").
  - third_party_claim: the author states something about someone else ("Alice owns a 4090"). The subject is the other person.
  - temporary_state: short-lived ("I'm sick today", "at the airport").
  - correction: the author corrects an earlier fact about themself ("I sold the 4070, have a 5070 now"). Set supersedes_fact_id when a known fact is replaced.
  - joke: sarcasm, irony, hyperbole, memes, roleplay ("I'm literally a toaster"). When unsure, use joke.
- Quoting someone else ("Bob said 'I bought a 4090'") is NOT a self-report by the author.
- Skip opinions about media/topics unless they reveal a stable preference (likes/dislikes), skip greetings, questions, and anything about the bot.
- Reuse predicates from the known facts list when the meaning matches.
- "[image: ...]" is an automatic description of an image the author posted. Only extract a fact from an image when the author's own text says it is theirs or about them ("my new setup", "finally hit diamond"); then the quote may come from the description. Memes and random pictures say nothing about the poster.
- Most batches contain zero facts. Return {"facts": []} when nothing qualifies.`;

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
  context: StoredMessage[];
  batch: StoredMessage[];
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
): (Candidate & { message: StoredMessage; kind: FactKind })[] {
  const out: (Candidate & { message: StoredMessage; kind: FactKind })[] = [];
  for (const c of candidates) {
    if (!batchRefs.has(c.source_ref)) continue;
    const message = refToMessage.get(c.source_ref);
    if (!message || message.isOwnBot) continue;
    if (c.classification === "joke") continue;

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
      if (c.classification === "temporary_state") continue; // hearsay about someone's mood: not worth keeping
      kind = "third_party_claim";
    } else if (c.classification === "temporary_state") {
      kind = "temporary_state";
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

    out.push({ ...c, predicate, value, supersedes_fact_id: supersedes, message, kind });
  }
  return out;
}

export function storeValidatedFacts(guildId: string, facts: ReturnType<typeof validateCandidates>): number {
  const db = getV2DB();
  const now = Date.now();
  let stored = 0;
  db.transaction(() => {
    for (const f of facts) {
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
          `UPDATE facts SET last_confirmed_at = ?, kind = CASE WHEN ? THEN 'self_report' ELSE kind END,
             expires_at = CASE WHEN ? THEN NULL ELSE expires_at END WHERE id = ?`
        ).run(now, upgrade ? 1 : 0, upgrade ? 1 : 0, factId);
      } else {
        const expires = f.kind === "temporary_state" ? now + TEMP_STATE_TTL : f.kind === "third_party_claim" ? now + HEARSAY_TTL : null;
        factId = Number(
          db
            .prepare(
              `INSERT INTO facts (guild_id, subject_user_id, predicate, value, normalized_key, multi_valued, kind, status,
                 source_kind, first_seen_at, last_confirmed_at, expires_at, supersedes_fact_id, extractor_version)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'extracted', ?, ?, ?, ?, ?)`
            )
            .run(
              guildId,
              f.subject_user_id,
              f.predicate,
              f.value,
              key,
              f.multi_valued ? 1 : 0,
              f.kind,
              now,
              now,
              expires,
              f.supersedes_fact_id,
              EXTRACTOR_VERSION
            ).lastInsertRowid
        );
        stored++;

        // Self-reported single-valued facts replace older values of the same predicate.
        if (f.kind === "self_report" && !f.multi_valued) {
          db.prepare(
            `UPDATE facts SET status = 'superseded' WHERE guild_id = ? AND subject_user_id = ? AND predicate = ?
               AND id != ? AND status = 'active' AND multi_valued = 0`
          ).run(guildId, f.subject_user_id, f.predicate, factId);
        }
        if (f.supersedes_fact_id != null) {
          db.prepare("UPDATE facts SET status = 'superseded' WHERE guild_id = ? AND id = ?").run(guildId, f.supersedes_fact_id);
        }
      }

      db.prepare(
        `INSERT OR IGNORE INTO fact_evidence (fact_id, guild_id, message_id, message_revision, reporter_user_id, evidence_quote, evidence_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(factId, guildId, f.message.messageId, f.message.revision, f.message.authorId, f.evidence_quote.slice(0, 300), f.kind);
    }
  })();
  return stored;
}

/**
 * Cheap pre-filter so "lol", emoji spam and bare links never cost an extractor
 * call. Such messages are still passed along as context.
 */
export function isWorthExtracting(content: string): boolean {
  const text = content
    .replace(/<a?:\w+:\d+>/g, " ")
    .replace(/<[@#][!&]?\d+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[(attachment|sticker): [^\]]*\]/g, " ")
    .trim();
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length < 2 || text.length < 6) return false;
  if (/^(l+o+l+|lmao+|xd+|haha+|ok+|okay|yes|no|nah|yeah|bruh|gg|wtf|kek)$/i.test(words.join(""))) return false;
  return true;
}

function renderForExtractor(m: StoredMessage, ref: string, tag: "EXTRACT" | "CONTEXT", refOf: Map<string, string>): string {
  let text = m.content;
  for (const r of [...m.nameRefs].filter((r) => r.confidence === "high" && r.userId).sort((a, b) => b.start - a.start)) {
    text = text.slice(0, r.end) + ` [= user ${r.userId}]` + text.slice(r.end);
  }
  text = text.replace(/<@!?(\d+)>/g, "@[user $1]");
  if (m.images.length) text = `${text} ${renderImages(m.images)}`.trim();
  const reply = m.replyToMessageId ? ` (reply to ${refOf.get(m.replyToMessageId) ?? "older message"})` : "";
  const who = m.isOwnBot ? "BOT" : `${m.authorName} [user ${m.authorId}]`;
  return `[${tag}] ${ref} ${who}${reply}: ${text}`;
}

async function extractBatch(job: ExtractionBatch): Promise<ExtractionStats> {
  const { guildId, context, batch } = job;
  const refOf = new Map<string, string>();
  const refToMessage = new Map<string, StoredMessage>();
  [...context, ...batch].forEach((m, i) => {
    refOf.set(m.messageId, `m${i + 1}`);
    refToMessage.set(`m${i + 1}`, m);
  });
  const evidenceIds = batch
    .filter((m) => !m.isOwnBot && isWorthExtracting(m.content) && userAllowsLearning(guildId, m.authorId))
    .map((m) => m.messageId);
  const batchRefs = new Set(evidenceIds.map((id) => refOf.get(id)!));
  const done = batch.map((m) => ({ messageId: m.messageId, revision: m.revision }));

  if (batchRefs.size === 0) {
    markExtracted(guildId, done);
    return { stored: 0, cost: 0, calls: 0 };
  }

  const subjects = new Set<string>();
  for (const m of [...context, ...batch]) {
    subjects.add(m.authorId);
    m.mentionedUserIds.forEach((id) => subjects.add(id));
    m.nameRefs.forEach((r) => r.userId && subjects.add(r.userId));
  }
  const known = getActiveFacts(guildId, [...subjects]).slice(0, 60);
  const knownById = new Map(known.map((f) => [f.id, f]));

  const log = [
    ...context.map((m) => renderForExtractor(m, refOf.get(m.messageId)!, "CONTEXT", refOf)),
    ...batch.map((m) =>
      renderForExtractor(m, refOf.get(m.messageId)!, batchRefs.has(refOf.get(m.messageId)!) ? "EXTRACT" : "CONTEXT", refOf)
    ),
  ].join("\n");
  const knownText = known.length
    ? known.map((f) => `#${f.id} user ${f.subjectUserId}: ${f.predicate} = ${f.value} (${f.kind})`).join("\n")
    : "(none)";

  const start = Date.now();
  const result = await generateText({
    model: createOpenRouter().chat(MODELS.extract),
    system: EXTRACTOR_SYSTEM,
    prompt: `<known_facts>\n${knownText}\n</known_facts>\n\n<chat_log>\n${log}\n</chat_log>`,
    output: Output.object({ schema: candidateSchema }),
    maxRetries: 1,
    timeout: 60_000,
  });

  const candidates = (result.output?.facts ?? []) as Candidate[];
  const valid = validateCandidates(guildId, candidates, refToMessage, batchRefs, knownById);
  // Learning may have been switched off while the model was running.
  const allowed = job.backfill ? getAISettings(guildId).learning : isLearningActive(guildId);
  const stored = allowed ? storeValidatedFacts(guildId, valid) : 0;
  markExtracted(guildId, done);

  const usage = result.totalUsage;
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
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const ctx = getMessagesBefore(guildId, channelId, batch[0].createdAt, 8).filter(
      (m) => m.createdAt >= batch[0].createdAt - 30 * 60 * 1000
    );
    const key = batch[0].messageId;
    try {
      await runBatch({ guildId, context: ctx, batch });
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
