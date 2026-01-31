import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "path";

const DB_PATH = process.env.VECTOR_DB_PATH || path.join(process.cwd(), "data", "vector.db");
const USER_ID = "222398053703876628";

const db = new Database(DB_PATH);
sqliteVec.load(db);

const rows = db.prepare(`
  SELECT id, message_id, user_id, user_name, channel_id, content, created_at
  FROM messages
  WHERE user_id = ?
  ORDER BY created_at DESC
`).all(USER_ID);

console.log(`Found ${rows.length} messages for user ${USER_ID}:\n`);
for (const row of rows) {
  const date = new Date(row.created_at).toISOString();
  console.log(`[${date}] (${row.user_name}) ${row.content}`);
}

// Also check total counts
const total = db.prepare("SELECT COUNT(*) as count FROM messages").get();
const embedCount = db.prepare("SELECT COUNT(*) as count FROM message_embeddings").get();
console.log(`\nTotal messages in DB: ${total.count}`);
console.log(`Total embeddings in DB: ${embedCount.count}`);

db.close();
