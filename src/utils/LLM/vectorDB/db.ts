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

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      content TEXT NOT NULL,
      context_window TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);

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

export function messageExists(messageId: string): boolean {
  const row = getDB().prepare("SELECT 1 FROM messages WHERE message_id = ?").get(messageId) as any;
  return !!row;
}
