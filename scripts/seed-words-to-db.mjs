// Seed the Postgres `words` table from data/words.json. Idempotent — re-running
// upserts every row. Usage: DATABASE_URL=postgres://... node scripts/seed-words-to-db.mjs
import { promises as fs } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const raw = await fs.readFile(path.join(process.cwd(), "data", "words.json"), "utf8");
const words = JSON.parse(raw);

const needsSsl = /sslmode=require|neon\.tech|render\.com/.test(url);
const pool = new pg.Pool({ connectionString: url, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });

await pool.query(`CREATE TABLE IF NOT EXISTS words (id text PRIMARY KEY, data jsonb NOT NULL)`);

let n = 0;
for (const w of words) {
  await pool.query(
    `INSERT INTO words (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
    [w.id, w]
  );
  n++;
}

await pool.end();
console.log(`Seeded ${n} words into the words table.`);
