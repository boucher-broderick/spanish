// Per-user state persistence. Uses Postgres (single JSONB row per user) when
// DATABASE_URL is set; otherwise falls back to a local JSON file so the app runs
// with zero setup. Node-only module — never import from middleware/edge.
import "server-only";
import type { Pool } from "pg";
import { promises as fs } from "node:fs";
import path from "node:path";

// The app's per-user state. Intentionally open-ended for the skeleton — features
// can narrow this to their own shape later.
export type AppState = Record<string, unknown>;
export function emptyState(): AppState {
  return {};
}

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
        `CREATE TABLE IF NOT EXISTS app_state (
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
  return path.join(DATA_DIR, `state-${user.replace(/[^a-z0-9_-]/gi, "_")}.json`);
}

async function loadFromFile(user: string): Promise<AppState> {
  try {
    return JSON.parse(await fs.readFile(fileFor(user), "utf8")) as AppState;
  } catch {
    return emptyState();
  }
}

async function saveToFile(user: string, data: AppState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(fileFor(user), JSON.stringify(data, null, 2));
}

// Connection/DNS-level failures mean the DB is unreachable (e.g. running locally
// against a cloud-internal host). Degrade to file storage rather than 500.
function isConnError(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" || code === "ECONNRESET";
}

export async function loadState(user: string): Promise<AppState> {
  if (USE_DB) {
    try {
      const pool = await getPool();
      const res = await pool.query("SELECT data FROM app_state WHERE id = $1", [user]);
      return (res.rows[0]?.data as AppState) ?? emptyState();
    } catch (e) {
      if (!isConnError(e)) throw e;
      poolPromise = null; // reset so a later attempt can reconnect
      console.warn("[store] DB unreachable, reading from file:", (e as Error).message);
    }
  }
  return loadFromFile(user);
}

export async function saveState(user: string, data: AppState): Promise<void> {
  if (USE_DB) {
    try {
      const pool = await getPool();
      await pool.query(
        `INSERT INTO app_state (id, data, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [user, data]
      );
      return;
    } catch (e) {
      if (!isConnError(e)) throw e;
      poolPromise = null;
      console.warn("[store] DB unreachable, writing to file:", (e as Error).message);
    }
  }
  await saveToFile(user, data);
}
