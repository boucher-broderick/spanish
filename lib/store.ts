// Progress persistence. Uses Postgres (single JSONB row per user) when DATABASE_URL
// is set; otherwise falls back to a local JSON file so the app runs with zero setup.
// Node-only module — never import from middleware/edge.
import "server-only";
import type { Pool } from "pg";
import { promises as fs } from "node:fs";
import path from "node:path";
import { emptyState, ProgressState, Word } from "./domain";

export const USE_DB = !!process.env.DATABASE_URL;

// ---- Postgres backend ----
let poolPromise: Promise<Pool> | null = null;
export async function getPool(): Promise<Pool> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const { Pool } = await import("pg");
      const needsSsl = /sslmode=require|neon\.tech|render\.com/.test(process.env.DATABASE_URL!);
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      });
      await pool.query(
        `CREATE TABLE IF NOT EXISTS progress (
           id text PRIMARY KEY,
           data jsonb NOT NULL,
           updated_at timestamptz NOT NULL DEFAULT now()
         )`
      );
      return pool;
    })();
  }
  return poolPromise;
}

// ---- file backend ----
const DATA_DIR = path.join(process.cwd(), ".data");
function fileFor(user: string): string {
  return path.join(DATA_DIR, `progress-${user.replace(/[^a-z0-9_-]/gi, "_")}.json`);
}

export async function loadProgress(user: string): Promise<ProgressState> {
  if (USE_DB) {
    const pool = await getPool();
    const res = await pool.query("SELECT data FROM progress WHERE id = $1", [user]);
    if (res.rows[0]?.data) return res.rows[0].data as ProgressState;
    return emptyState();
  }
  try {
    const raw = await fs.readFile(fileFor(user), "utf8");
    return JSON.parse(raw) as ProgressState;
  } catch {
    return emptyState();
  }
}

export async function saveProgress(user: string, data: ProgressState): Promise<void> {
  if (USE_DB) {
    const pool = await getPool();
    await pool.query(
      `INSERT INTO progress (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [user, data]
    );
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(fileFor(user), JSON.stringify(data, null, 2));
}

// ---- words ----
// Static reference data. Served from the `words` table when DATABASE_URL is set
// and the table is seeded (scripts/seed-words-to-db.mjs); otherwise falls back to
// the committed data/words.json. Cached in-memory after first load (words never
// change at runtime).
let wordsCache: Word[] | null = null;

async function loadWordsFromFile(): Promise<Word[]> {
  const raw = await fs.readFile(path.join(process.cwd(), "data", "words.json"), "utf8");
  return JSON.parse(raw) as Word[];
}

export async function loadWords(): Promise<Word[]> {
  if (wordsCache) return wordsCache;
  if (USE_DB) {
    try {
      const pool = await getPool();
      await pool.query(`CREATE TABLE IF NOT EXISTS words (id text PRIMARY KEY, data jsonb NOT NULL)`);
      const res = await pool.query("SELECT data FROM words");
      if (res.rows.length > 0) {
        wordsCache = res.rows.map((r) => r.data as Word).sort((a, b) => a.rank - b.rank);
        return wordsCache;
      }
    } catch (err) {
      // DB unreachable (e.g. local container down) — words are static, so the
      // bundled file is a safe fallback rather than failing the whole app.
      console.warn("loadWords: DB read failed, using bundled words.json", err);
    }
  }
  // DB unset, table empty, or DB unreachable — fall back to the bundled file.
  const fromFile = await loadWordsFromFile();
  // Only cache when the file is the authoritative source (no DB configured).
  // After a transient DB failure, leave the cache empty so the next call retries.
  if (!USE_DB) wordsCache = fromFile;
  return fromFile;
}
