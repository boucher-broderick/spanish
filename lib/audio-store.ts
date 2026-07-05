// Persistence for synthesized TTS audio. Stores WAV bytes in Postgres (a
// dedicated bytea table) when DATABASE_URL is set, otherwise falls back to local
// files under ./.data/audio so the app still works with zero setup. Audio is
// content-addressed by a hash of its text, so identical clips are synthesized
// once and replayed from storage thereafter — surviving reloads and restarts,
// the same way stories persist. Audio bytes deliberately live here, NOT in the
// per-user JSONB state blob (lib/store.ts), to keep that row small.
import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getPool, USE_DB } from "./store";
import { aiConfigured, synthesizeSpeech, AUDIO_KEY_SALT } from "./ai";

const AUDIO_DIR = path.join(process.cwd(), ".data", "audio");

/**
 * Content key for a clip: identical text → identical key → synthesized once,
 * reused forever. Salted with the provider/voice (AUDIO_KEY_SALT) so switching
 * TTS provider or voice yields fresh keys and never serves a stale clip in the
 * old voice.
 */
export function keyFor(text: string): string {
  return createHash("sha256").update(`${AUDIO_KEY_SALT}\n${text}`).digest("hex");
}

let ready: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const pool = await getPool();
      await pool.query(
        `CREATE TABLE IF NOT EXISTS tts_audio (
           id text PRIMARY KEY,
           audio bytea NOT NULL,
           created_at timestamptz NOT NULL DEFAULT now()
         )`
      );
    })();
  }
  return ready;
}

function isConnError(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" || code === "ECONNRESET";
}

function fileFor(key: string): string {
  return path.join(AUDIO_DIR, `${key}.wav`);
}

async function readFile(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(fileFor(key));
  } catch {
    return null;
  }
}

async function writeFile(key: string, audio: Buffer): Promise<void> {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
  await fs.writeFile(fileFor(key), audio).catch(() => {});
}

/** Fetch cached audio for a content key, or null if not synthesized yet. */
export async function getAudio(key: string): Promise<Buffer | null> {
  if (USE_DB) {
    try {
      await ensureSchema();
      const pool = await getPool();
      const res = await pool.query("SELECT audio FROM tts_audio WHERE id = $1", [key]);
      const row = res.rows[0];
      return row ? (row.audio as Buffer) : null;
    } catch (e) {
      if (!isConnError(e)) throw e;
      console.warn("[audio-store] DB unreachable, reading from file:", (e as Error).message);
    }
  }
  return readFile(key);
}

/**
 * Ensure a clip for `text` exists in the store, synthesizing it only on a miss.
 * Always checks the persistent store first (getAudio), so a clip is generated
 * exactly once and reused forever — nothing is ever regenerated. Best-effort:
 * a no-op when TTS isn't configured, and swallows synthesis errors so
 * pre-warming a batch never fails the caller. Returns true if audio is present
 * afterward (cache hit or freshly synthesized).
 */
export async function ensureAudio(text: string): Promise<boolean> {
  const clean = text.trim();
  if (!clean) return false;
  const key = keyFor(clean);
  if (await getAudio(key)) return true; // already stored — never re-synthesize
  if (!aiConfigured()) return false;
  try {
    const { audio } = await synthesizeSpeech(clean);
    await putAudio(key, audio);
    return true;
  } catch (e) {
    console.warn("[audio-store] synthesis failed for pre-warm:", (e as Error).message);
    return false;
  }
}

/** Store synthesized audio under a content key (idempotent). */
export async function putAudio(key: string, audio: Buffer): Promise<void> {
  if (USE_DB) {
    try {
      await ensureSchema();
      const pool = await getPool();
      await pool.query(
        "INSERT INTO tts_audio (id, audio) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
        [key, audio]
      );
      return;
    } catch (e) {
      if (!isConnError(e)) throw e;
      console.warn("[audio-store] DB unreachable, writing to file:", (e as Error).message);
    }
  }
  await writeFile(key, audio);
}
