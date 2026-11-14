import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/**
 * Storage for the v2 "memory" engine. Kept in its own file so the legacy
 * vector DB (and its destructive schema migration) is never touched.
 * Snowflakes are always stored as TEXT.
 */
const DB_PATH =
  process.env.MEMORY_V2_DB_PATH ||
  (process.env.VECTOR_DB_PATH
    ? path.join(path.dirname(process.env.VECTOR_DB_PATH), "memory-v2.db")
    : path.join(process.cwd(), "data", "memory-v2.db"));

let db: Database.Database | null = null;

type Migration = { version: number; sql: string };

// Additive, numbered migrations. Never drop tables here.
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE guild_ai_settings (
        guild_id TEXT PRIMARY KEY,
        engine TEXT NOT NULL DEFAULT 'legacy',
        web_mode TEXT NOT NULL DEFAULT 'auto',
        learning INTEGER NOT NULL DEFAULT 1,
        engine_enabled_at INTEGER,
        updated_at INTEGER NOT NULL,
        updated_by TEXT
      );

      CREATE TABLE messages (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        is_own_bot INTEGER NOT NULL DEFAULT 0,
        content TEXT NOT NULL,
        reply_to_message_id TEXT,
        mentioned_user_ids TEXT NOT NULL DEFAULT '[]',
        name_refs TEXT NOT NULL DEFAULT '[]',
        trigger_message_id TEXT,
        created_at INTEGER NOT NULL,
        edited_at INTEGER,
        deleted_at INTEGER,
        revision INTEGER NOT NULL DEFAULT 0,
        extracted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, message_id)
      );
      CREATE INDEX idx_v2_messages_channel_time ON messages(guild_id, channel_id, created_at);
      CREATE INDEX idx_v2_messages_author_time ON messages(guild_id, author_id, created_at);
      CREATE INDEX idx_v2_messages_extract ON messages(guild_id, extracted, created_at);

      CREATE TABLE nicknames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        normalized TEXT NOT NULL,
        source TEXT NOT NULL,
        added_by TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE (guild_id, normalized, user_id, source)
      );
      CREATE INDEX idx_v2_nicknames_guild ON nicknames(guild_id);

      CREATE TABLE facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        subject_user_id TEXT NOT NULL,
        predicate TEXT NOT NULL,
        value TEXT NOT NULL,
        normalized_key TEXT NOT NULL,
        multi_valued INTEGER NOT NULL DEFAULT 0,
        kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        source_kind TEXT NOT NULL DEFAULT 'extracted',
        first_seen_at INTEGER NOT NULL,
        last_confirmed_at INTEGER NOT NULL,
        expires_at INTEGER,
        supersedes_fact_id INTEGER,
        extractor_version TEXT NOT NULL
      );
      CREATE INDEX idx_v2_facts_subject ON facts(guild_id, subject_user_id, status);
      CREATE INDEX idx_v2_facts_key ON facts(guild_id, subject_user_id, normalized_key);

      CREATE TABLE fact_evidence (
        fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
        guild_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        message_revision INTEGER NOT NULL,
        reporter_user_id TEXT NOT NULL,
        evidence_quote TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        PRIMARY KEY (fact_id, message_id)
      );
      CREATE INDEX idx_v2_evidence_message ON fact_evidence(guild_id, message_id);

      CREATE TABLE fact_usage (
        fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        used_at INTEGER NOT NULL
      );
      CREATE INDEX idx_v2_fact_usage ON fact_usage(guild_id, channel_id, used_at);

      CREATE TABLE responses (
        trigger_message_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        requester_id TEXT NOT NULL,
        target_ids TEXT NOT NULL DEFAULT '[]',
        state TEXT NOT NULL,
        engine TEXT NOT NULL,
        model TEXT,
        reply_message_id TEXT,
        tools_used TEXT NOT NULL DEFAULT '[]',
        fact_ids TEXT NOT NULL DEFAULT '[]',
        input_tokens INTEGER,
        output_tokens INTEGER,
        cost REAL,
        error TEXT,
        created_at INTEGER NOT NULL,
        finished_at INTEGER
      );

      CREATE TABLE memory_preferences (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        learning INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );
    `,
  },
  {
    version: 2,
    sql: `ALTER TABLE messages ADD COLUMN images TEXT NOT NULL DEFAULT '[]';`,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE backfill_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        since INTEGER NOT NULL,
        until INTEGER NOT NULL,
        channel_ids TEXT NOT NULL DEFAULT '[]',
        include_images INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL,
        dm_channel_id TEXT,
        dm_message_id TEXT,
        scanned INTEGER NOT NULL DEFAULT 0,
        to_analyze INTEGER NOT NULL DEFAULT 0,
        images INTEGER NOT NULL DEFAULT 0,
        estimate_cost REAL,
        processed INTEGER NOT NULL DEFAULT 0,
        facts_stored INTEGER NOT NULL DEFAULT 0,
        cost_spent REAL NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE user_profiles (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        profile TEXT,
        fact_count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0,
        dirty INTEGER NOT NULL DEFAULT 0,
        dirty_since INTEGER,
        PRIMARY KEY (guild_id, user_id)
      );
      CREATE INDEX idx_v2_profiles_dirty ON user_profiles(dirty, dirty_since);
      CREATE INDEX idx_v2_facts_time ON facts(guild_id, subject_user_id, last_confirmed_at);
    `,
  },
  {
    // No temporary facts any more; rewrite existing profiles without dates.
    version: 5,
    sql: `
      UPDATE facts SET status = 'retracted' WHERE kind = 'temporary_state';
      UPDATE user_profiles SET dirty = 1, dirty_since = 0, updated_at = 0 WHERE profile IS NOT NULL;
    `,
  },
  {
    // Shorter profiles without a roast list: rewrite them.
    version: 6,
    sql: `UPDATE user_profiles SET dirty = 1, dirty_since = 0, updated_at = 0 WHERE profile IS NOT NULL;`,
  },
  {
    version: 7,
    sql: `
      ALTER TABLE facts ADD COLUMN category TEXT;
      ALTER TABLE backfill_jobs ADD COLUMN reset INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    // Longer profiles: rewrite them.
    version: 8,
    sql: `UPDATE user_profiles SET dirty = 1, dirty_since = 0, updated_at = 0 WHERE profile IS NOT NULL;`,
  },
  {
    // Facts live forever: drop existing expiry dates (hearsay used to expire after 90 days).
    version: 9,
    sql: `UPDATE facts SET expires_at = NULL WHERE kind != 'temporary_state';`,
  },
  {
    // Hand-edited profiles (/memory editprofile) are locked against automatic rewrites.
    version: 10,
    sql: `ALTER TABLE user_profiles ADD COLUMN manual INTEGER NOT NULL DEFAULT 0;`,
  },
];

export function getV2DB(): Database.Database {
  if (!db) db = openDB(DB_PATH);
  return db;
}

/** Point the module at a specific database file (tests use ":memory:"). */
export function initV2DBAt(file: string): Database.Database {
  db = openDB(file);
  return db;
}

function openDB(file: string): Database.Database {
  if (file !== ":memory:") {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const instance = new Database(file);
  if (file !== ":memory:") instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.pragma("busy_timeout = 5000");

  instance.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`);
  const applied = new Set(
    (instance.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version)
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    instance.transaction(() => {
      instance.exec(m.sql);
      instance.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(m.version, Date.now());
    })();
    console.log(`[MemoryV2] Applied migration ${m.version}`);
  }

  console.log("[MemoryV2] Database ready at", file);
  return instance;
}
