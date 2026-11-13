import { getV2DB } from "./db";

export type EngineName = "legacy" | "memory";
export type WebMode = "auto" | "off";

export type GuildAISettings = {
  engine: EngineName;
  webMode: WebMode;
  learning: boolean;
  engineEnabledAt: number | null;
};

const DEFAULTS: GuildAISettings = { engine: "legacy", webMode: "auto", learning: true, engineEnabledAt: null };
const cache = new Map<string, GuildAISettings>();

type Row = { engine: string; web_mode: string; learning: number; engine_enabled_at: number | null };

export function getAISettings(guildId: string): GuildAISettings {
  const hit = cache.get(guildId);
  if (hit) return hit;
  const row = getV2DB()
    .prepare("SELECT engine, web_mode, learning, engine_enabled_at FROM guild_ai_settings WHERE guild_id = ?")
    .get(guildId) as Row | undefined;
  const s: GuildAISettings = row
    ? {
        engine: row.engine === "memory" ? "memory" : "legacy",
        webMode: row.web_mode === "off" ? "off" : "auto",
        learning: row.learning === 1,
        engineEnabledAt: row.engine_enabled_at,
      }
    : { ...DEFAULTS };
  cache.set(guildId, s);
  return s;
}

export function updateAISettings(guildId: string, patch: Partial<GuildAISettings>, updatedBy: string): GuildAISettings {
  const prev = getAISettings(guildId);
  const next: GuildAISettings = { ...prev, ...patch };
  if (patch.engine === "memory" && prev.engine !== "memory") next.engineEnabledAt = Date.now();
  getV2DB()
    .prepare(
      `INSERT INTO guild_ai_settings (guild_id, engine, web_mode, learning, engine_enabled_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(guild_id) DO UPDATE SET engine = excluded.engine, web_mode = excluded.web_mode,
         learning = excluded.learning, engine_enabled_at = excluded.engine_enabled_at,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .run(guildId, next.engine, next.webMode, next.learning ? 1 : 0, next.engineEnabledAt, Date.now(), updatedBy);
  cache.set(guildId, next);
  return next;
}

/** Fact learning runs only while the memory engine is active and learning is on. */
export function isLearningActive(guildId: string): boolean {
  const s = getAISettings(guildId);
  return s.engine === "memory" && s.learning;
}

export function userAllowsLearning(guildId: string, userId: string): boolean {
  const row = getV2DB()
    .prepare("SELECT learning FROM memory_preferences WHERE guild_id = ? AND user_id = ?")
    .get(guildId, userId) as { learning: number } | undefined;
  return row ? row.learning === 1 : true;
}

export function setUserLearning(guildId: string, userId: string, enabled: boolean): void {
  getV2DB()
    .prepare(
      `INSERT INTO memory_preferences (guild_id, user_id, learning, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(guild_id, user_id) DO UPDATE SET learning = excluded.learning, updated_at = excluded.updated_at`
    )
    .run(guildId, userId, enabled ? 1 : 0, Date.now());
}

export const MODELS = {
  chat: process.env.V2_CHAT_MODEL || "openai/gpt-6-luna",
  extract: process.env.V2_EXTRACT_MODEL || "openai/gpt-6-luna",
  search: process.env.V2_SEARCH_MODEL || "openai/gpt-6-luna",
  vision: process.env.V2_VISION_MODEL || "openai/gpt-6-luna",
};
