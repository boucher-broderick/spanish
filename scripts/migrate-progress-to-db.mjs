// One-off migration: copy file-based progress (.data/progress-<user>.json) into
// the Postgres `progress` table. Idempotent — re-running upserts the same rows.
// Usage: DATABASE_URL=postgres://... node scripts/migrate-progress-to-db.mjs
import { promises as fs } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const DATA_DIR = path.join(process.cwd(), ".data");
const needsSsl = /sslmode=require|neon\.tech|render\.com/.test(url);
const pool = new pg.Pool({ connectionString: url, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });

await pool.query(
  `CREATE TABLE IF NOT EXISTS progress (
     id text PRIMARY KEY,
     data jsonb NOT NULL,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`
);

let files = [];
try {
  files = (await fs.readdir(DATA_DIR)).filter((f) => /^progress-.+\.json$/.test(f));
} catch {
  console.log("No .data directory — nothing to migrate.");
  await pool.end();
  process.exit(0);
}

if (files.length === 0) console.log("No progress files found.");

for (const file of files) {
  const user = file.replace(/^progress-/, "").replace(/\.json$/, "");
  const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
  const data = JSON.parse(raw);
  await pool.query(
    `INSERT INTO progress (id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [user, data]
  );
  console.log(`Migrated ${file} → progress[id=${user}]`);
}

await pool.end();
console.log("Done.");
