import { generateText } from "ai";
import { createOpenRouter, computeCost, logAPICall } from "../utils/api/openrouter";
import { getV2DB } from "./db";
import { drainTouchedSubjects, getActiveFacts } from "./facts";
import { getAISettings, MODELS, userAllowsLearning } from "./settings";

/**
 * One short profile per user per server: who they are, how they talk, what
 * they're into, running jokes. Written by a cheap model from the user's facts
 * (with dates) and a sample of their recent messages, and refreshed in the
 * background whenever their facts change.
 */

export type UserProfile = { guildId: string; userId: string; profile: string; updatedAt: number; factCount: number };

const REFRESH_INTERVAL_MS = 2 * 60_000;
/** Don't regenerate the same person more often than this. */
const MIN_REGEN_GAP_MS = 30 * 60_000;
const PER_RUN = 8;
const SAMPLE_MESSAGES = 80;
const MAX_PROFILE_CHARS = 1200;

let timer: NodeJS.Timeout | null = null;
let running = false;

type Row = {
  guild_id: string;
  user_id: string;
  profile: string | null;
  fact_count: number;
  updated_at: number;
  dirty: number;
  dirty_since: number | null;
};

export function getProfile(guildId: string, userId: string): UserProfile | null {
  const r = getV2DB().prepare("SELECT * FROM user_profiles WHERE guild_id = ? AND user_id = ?").get(guildId, userId) as Row | undefined;
  if (!r || !r.profile) return null;
  return { guildId, userId, profile: r.profile, updatedAt: r.updated_at, factCount: r.fact_count };
}

export function deleteProfile(guildId: string, userId: string): void {
  getV2DB().prepare("DELETE FROM user_profiles WHERE guild_id = ? AND user_id = ?").run(guildId, userId);
}

/** Mark a profile for regeneration (its facts changed). */
export function markProfileDirty(guildId: string, userId: string): void {
  getV2DB()
    .prepare(
      `INSERT INTO user_profiles (guild_id, user_id, profile, fact_count, updated_at, dirty, dirty_since)
       VALUES (?, ?, NULL, 0, 0, 1, ?)
       ON CONFLICT(guild_id, user_id) DO UPDATE SET dirty = 1, dirty_since = COALESCE(dirty_since, excluded.dirty_since)`
    )
    .run(guildId, userId, Date.now());
}

const PROFILE_SYSTEM = `You write short internal profiles of members of a Discord friend group, for a sarcastic bot that chats with and roasts them.
Use ONLY the facts and messages given. Never invent anything. Plain text, max 90 words, no preamble, no dates. Describe the person, don't list trivia:
Personality: humor, attitude, role in the group, what they get teased about.
Talks like: language(s), tone, slang, catchphrases, typing quirks.
Into: their main games/hobbies and what they're known for.
Mark hearsay ("according to X"). Leave out health, sexuality, religion and politics unless the person jokes about it themself.`;

let generateImpl = async (prompt: string): Promise<string> => {
  const start = Date.now();
  const result = await generateText({
    model: createOpenRouter().chat(MODELS.extract),
    system: PROFILE_SYSTEM,
    prompt,
    maxOutputTokens: 400,
    maxRetries: 1,
    timeout: 60_000,
  });
  const u = result.totalUsage;
  logAPICall({
    type: "MemoryV2.profile",
    model: MODELS.extract,
    inputTokens: u.inputTokens || 0,
    outputTokens: u.outputTokens || 0,
    cost: computeCost(MODELS.extract, u.inputTokens || 0, u.outputTokens || 0).toFixed(6),
    durationMs: Date.now() - start,
  });
  return result.text;
};

/** Test hook: replace the model call (pass nothing to restore). */
export function _setProfileGeneratorForTests(fn?: (prompt: string) => Promise<string>): void {
  if (fn) generateImpl = fn;
}

export function buildProfilePrompt(guildId: string, userId: string): { prompt: string; factCount: number; messageCount: number } {
  const facts = getActiveFacts(guildId, [userId]).slice(0, 60);
  const messages = (
    getV2DB()
      .prepare(
        `SELECT author_name, content, created_at FROM messages
         WHERE guild_id = ? AND author_id = ? AND deleted_at IS NULL AND is_own_bot = 0 AND length(content) >= 4
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(guildId, userId, SAMPLE_MESSAGES) as { author_name: string; content: string; created_at: number }[]
  ).reverse();
  const previous = getProfile(guildId, userId);
  const name = messages.length ? messages[messages.length - 1].author_name : "unknown";

  const factLines = facts.map((f) => {
    const src = f.kind === "third_party_claim" ? `according to ${f.reporters.map((r) => `user ${r}`).join(", ")}` : "said by themself";
    return `- ${f.predicate.replace(/_/g, " ")}: ${f.value} (${src})`;
  });
  const msgLines = messages.map((m) => `- ${m.content.replace(/\s+/g, " ").slice(0, 200)}`);

  const prompt = [
    `Person: ${name} [user ${userId}]`,
    previous ? `\n<previous_profile>\n${previous.profile}\n</previous_profile>\nUpdate it with the new information; drop things that are no longer true.` : "",
    `\n<facts>\n${factLines.join("\n") || "(none)"}\n</facts>`,
    `\n<their_recent_messages>\n${msgLines.join("\n") || "(none)"}\n</their_recent_messages>`,
  ].join("\n");
  return { prompt, factCount: facts.length, messageCount: messages.length };
}

export async function regenerateProfile(guildId: string, userId: string): Promise<UserProfile | null> {
  if (!userAllowsLearning(guildId, userId)) {
    deleteProfile(guildId, userId);
    return null;
  }
  const { prompt, factCount, messageCount } = buildProfilePrompt(guildId, userId);
  if (factCount === 0 && messageCount < 10) {
    // Not enough to say anything yet; try again when more is known.
    getV2DB().prepare("UPDATE user_profiles SET dirty = 0, dirty_since = NULL WHERE guild_id = ? AND user_id = ?").run(guildId, userId);
    return null;
  }
  const text = (await generateImpl(prompt)).trim().slice(0, MAX_PROFILE_CHARS);
  if (!text) return null;
  const now = Date.now();
  getV2DB()
    .prepare(
      `INSERT INTO user_profiles (guild_id, user_id, profile, fact_count, updated_at, dirty, dirty_since)
       VALUES (?, ?, ?, ?, ?, 0, NULL)
       ON CONFLICT(guild_id, user_id) DO UPDATE SET profile = excluded.profile, fact_count = excluded.fact_count,
         updated_at = excluded.updated_at, dirty = 0, dirty_since = NULL`
    )
    .run(guildId, userId, text, factCount, now);
  return { guildId, userId, profile: text, updatedAt: now, factCount };
}

/** One background pass: pick up changed facts, then refresh a few stale profiles. */
export async function runProfileRefreshOnce(): Promise<number> {
  if (running) return 0;
  running = true;
  let done = 0;
  try {
    for (const { guildId, userId } of drainTouchedSubjects()) markProfileDirty(guildId, userId);
    const due = getV2DB()
      .prepare(
        `SELECT guild_id, user_id FROM user_profiles WHERE dirty = 1 AND updated_at <= ?
         ORDER BY dirty_since ASC LIMIT ?`
      )
      .all(Date.now() - MIN_REGEN_GAP_MS, PER_RUN) as { guild_id: string; user_id: string }[];
    for (const row of due) {
      if (!getAISettings(row.guild_id).learning) continue;
      try {
        await regenerateProfile(row.guild_id, row.user_id);
        done++;
      } catch (err) {
        console.error(`[MemoryV2] Profile refresh failed for ${row.user_id}:`, (err as Error).message);
      }
    }
  } finally {
    running = false;
  }
  return done;
}

export function startProfileWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    runProfileRefreshOnce().catch((err) => console.error("[MemoryV2] Profile worker error:", err));
  }, REFRESH_INTERVAL_MS);
}
