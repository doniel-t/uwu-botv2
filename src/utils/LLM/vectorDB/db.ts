import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.VECTOR_DB_PATH || path.join(process.cwd(), "data", "vector.db");

let db: Database.Database | null = null;
let embeddingTableReady = false;

export function getDB(): Database.Database {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  sqliteVec.load(db);

  // Check if old schema exists (has context_window column) and migrate
  const tableInfo = db.prepare("PRAGMA table_info(messages)").all() as { name: string }[];
  if (tableInfo.length > 0 && tableInfo.some((col) => col.name === "context_window")) {
    console.log("[VectorDB] Old schema detected, dropping tables for migration...");
    db.exec(`DROP TABLE IF EXISTS message_embeddings`);
    db.exec(`DROP TABLE IF EXISTS messages`);
    db.exec(`DELETE FROM meta WHERE key = 'backfill_done'`);
    embeddingTableReady = false;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_message_id TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      reply_message_id TEXT,
      history TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_discord_id ON messages(discord_message_id);
    CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(channel_id, created_at);

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Check if vec0 table already exists
  const vecTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='message_embeddings'"
  ).get();
  if (vecTableExists) {
    embeddingTableReady = true;
  }

  console.log("[VectorDB] Database initialized at", DB_PATH);
  return db;
}

// Create the vec0 table with the correct dimension (called after first embedding)
export function ensureEmbeddingTable(dimension: number): void {
  if (embeddingTableReady) return;
  const d = getDB();
  d.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS message_embeddings USING vec0(
      message_id INTEGER PRIMARY KEY,
      embedding float[${dimension}]
    );
  `);
  embeddingTableReady = true;
  console.log(`[VectorDB] Embedding table created with dimension ${dimension}`);
}

export function isBackfillDone(): boolean {
  const row = getDB().prepare("SELECT value FROM meta WHERE key = 'backfill_done'").get() as { value: string } | undefined;
  return row?.value === "true";
}

export function setBackfillDone(): void {
  getDB().prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('backfill_done', 'true')").run();
}

export function messageExists(discordMessageId: string): boolean {
  const row = getDB().prepare("SELECT 1 FROM messages WHERE discord_message_id = ?").get(discordMessageId) as any;
  return !!row;
}
