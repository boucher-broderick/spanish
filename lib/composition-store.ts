// Persistence for Writing prompts/attempts and Reading/Listening stories.
// Mirrors lib/store.ts: Postgres when DATABASE_URL is set, otherwise local JSON
// files under ./.data so the app runs with zero setup. Audio bytes live in a
// bytea column (DB) or a .wav file (file mode), never in the row payload, so
// listing stories stays cheap. Node-only — never import from edge/middleware.
import "server-only";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getPool, USE_DB } from "./store";
import type { QuizQuestion, StoryRow, WritingAttemptRow, WritingGrade, WritingPromptRow } from "./composition";

export type { StoryRow, WritingAttemptRow, WritingPromptRow };

const DATA_DIR = path.join(process.cwd(), ".data");
const AUDIO_DIR = path.join(DATA_DIR, "audio");

// ---------------- schema (DB) ----------------
let ready: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const pool = await getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS stories (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          title text NOT NULL,
          topic text,
          level text NOT NULL,
          tense text NOT NULL,
          length text NOT NULL,
          body text NOT NULL,
          quiz jsonb NOT NULL DEFAULT '[]',
          audio bytea,
          audio_mime text
        );
        CREATE INDEX IF NOT EXISTS stories_user_created ON stories (user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS writing_prompts (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          level text NOT NULL,
          tense text NOT NULL,
          topic text,
          prompt text NOT NULL,
          prompt_en text
        );
        CREATE INDEX IF NOT EXISTS writing_prompts_user_created ON writing_prompts (user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS writing_attempts (
          id text PRIMARY KEY,
          prompt_id text NOT NULL REFERENCES writing_prompts(id) ON DELETE CASCADE,
          user_id text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          body text NOT NULL,
          grade jsonb
        );
        CREATE INDEX IF NOT EXISTS writing_attempts_prompt ON writing_attempts (prompt_id, created_at);
      `);
    })();
  }
  return ready;
}

// ---------------- file backend helpers ----------------
function storiesFile(user: string): string {
  return path.join(DATA_DIR, `stories-${user.replace(/[^a-z0-9_-]/gi, "_")}.json`);
}
function writingFile(user: string): string {
  return path.join(DATA_DIR, `writing-${user.replace(/[^a-z0-9_-]/gi, "_")}.json`);
}
async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
async function writeJsonFile(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}
function audioFile(id: string): string {
  return path.join(AUDIO_DIR, `${id.replace(/[^a-z0-9_-]/gi, "_")}.wav`);
}

// File-mode rows are just StoryRow / WritingPromptRow — the per-user filename
// already scopes them, so no embedded user field is needed.

// ================= STORIES =================
export async function createStory(
  user: string,
  s: { title: string; topic: string | null; level: string; tense: string; length: string; body: string; quiz: QuizQuestion[] }
): Promise<StoryRow> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    await pool.query(
      `INSERT INTO stories (id, user_id, title, topic, level, tense, length, body, quiz)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, user, s.title, s.topic, s.level, s.tense, s.length, s.body, JSON.stringify(s.quiz)]
    );
  } else {
    const all = await readJsonFile<StoryRow[]>(storiesFile(user), []);
    all.unshift({ id, createdAt, hasAudio: false, ...s });
    await writeJsonFile(storiesFile(user), all);
  }
  return { id, createdAt, hasAudio: false, ...s };
}

export async function listStories(user: string): Promise<StoryRow[]> {
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    const res = await pool.query(
      `SELECT id, created_at, title, topic, level, tense, length, body, quiz,
              (audio IS NOT NULL) AS has_audio
       FROM stories WHERE user_id = $1 ORDER BY created_at DESC`,
      [user]
    );
    return res.rows.map(rowToStory);
  }
  const all = await readJsonFile<StoryRow[]>(storiesFile(user), []);
  return all;
}

export async function getStory(user: string, id: string): Promise<StoryRow | null> {
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    const res = await pool.query(
      `SELECT id, created_at, title, topic, level, tense, length, body, quiz,
              (audio IS NOT NULL) AS has_audio
       FROM stories WHERE user_id = $1 AND id = $2`,
      [user, id]
    );
    return res.rows[0] ? rowToStory(res.rows[0]) : null;
  }
  const all = await readJsonFile<StoryRow[]>(storiesFile(user), []);
  return all.find((s) => s.id === id) ?? null;
}

export async function deleteStory(user: string, id: string): Promise<void> {
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    await pool.query(`DELETE FROM stories WHERE user_id = $1 AND id = $2`, [user, id]);
    return;
  }
  const all = await readJsonFile<StoryRow[]>(storiesFile(user), []);
  await writeJsonFile(storiesFile(user), all.filter((s) => s.id !== id));
  await fs.rm(audioFile(id), { force: true }).catch(() => {});
}

export async function getStoryAudio(user: string, id: string): Promise<Buffer | null> {
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    const res = await pool.query(`SELECT audio FROM stories WHERE user_id = $1 AND id = $2`, [user, id]);
    const a = res.rows[0]?.audio;
    return a ? Buffer.from(a) : null;
  }
  try {
    return await fs.readFile(audioFile(id));
  } catch {
    return null;
  }
}

export async function setStoryAudio(user: string, id: string, audio: Buffer, mime: string): Promise<void> {
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    await pool.query(`UPDATE stories SET audio = $3, audio_mime = $4 WHERE user_id = $1 AND id = $2`, [
      user,
      id,
      audio,
      mime,
    ]);
    return;
  }
  await fs.mkdir(AUDIO_DIR, { recursive: true });
  await fs.writeFile(audioFile(id), audio);
  const all = await readJsonFile<StoryRow[]>(storiesFile(user), []);
  const s = all.find((x) => x.id === id);
  if (s) {
    s.hasAudio = true;
    await writeJsonFile(storiesFile(user), all);
  }
}

function rowToStory(r: Record<string, unknown>): StoryRow {
  return {
    id: r.id as string,
    createdAt: new Date(r.created_at as string).toISOString(),
    title: r.title as string,
    topic: (r.topic as string) ?? null,
    level: r.level as string,
    tense: r.tense as string,
    length: r.length as string,
    body: r.body as string,
    quiz: (r.quiz as QuizQuestion[]) ?? [],
    hasAudio: !!r.has_audio,
  };
}

// ================= WRITING =================
export async function createWritingPrompt(
  user: string,
  p: { level: string; tense: string; topic: string | null; prompt: string; promptEn: string | null }
): Promise<WritingPromptRow> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    await pool.query(
      `INSERT INTO writing_prompts (id, user_id, level, tense, topic, prompt, prompt_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, user, p.level, p.tense, p.topic, p.prompt, p.promptEn]
    );
  } else {
    const all = await readJsonFile<WritingPromptRow[]>(writingFile(user), []);
    all.unshift({ id, createdAt, attempts: [], ...p });
    await writeJsonFile(writingFile(user), all);
  }
  return { id, createdAt, attempts: [], ...p };
}

export async function listWritingPrompts(user: string): Promise<WritingPromptRow[]> {
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    const prompts = await pool.query(
      `SELECT id, created_at, level, tense, topic, prompt, prompt_en
       FROM writing_prompts WHERE user_id = $1 ORDER BY created_at DESC`,
      [user]
    );
    const attempts = await pool.query(
      `SELECT id, prompt_id, created_at, body, grade
       FROM writing_attempts WHERE user_id = $1 ORDER BY created_at ASC`,
      [user]
    );
    const byPrompt = new Map<string, WritingAttemptRow[]>();
    for (const a of attempts.rows) {
      const list = byPrompt.get(a.prompt_id) ?? [];
      list.push({
        id: a.id,
        createdAt: new Date(a.created_at).toISOString(),
        body: a.body,
        grade: (a.grade as WritingGrade) ?? null,
      });
      byPrompt.set(a.prompt_id, list);
    }
    return prompts.rows.map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at).toISOString(),
      level: r.level,
      tense: r.tense,
      topic: r.topic ?? null,
      prompt: r.prompt,
      promptEn: r.prompt_en ?? null,
      attempts: byPrompt.get(r.id) ?? [],
    }));
  }
  const all = await readJsonFile<WritingPromptRow[]>(writingFile(user), []);
  return all;
}

export async function addWritingAttempt(
  user: string,
  promptId: string,
  body: string,
  grade: WritingGrade | null
): Promise<WritingAttemptRow | null> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    const owns = await pool.query(`SELECT 1 FROM writing_prompts WHERE id = $1 AND user_id = $2`, [promptId, user]);
    if (owns.rowCount === 0) return null;
    await pool.query(
      `INSERT INTO writing_attempts (id, prompt_id, user_id, body, grade) VALUES ($1,$2,$3,$4,$5)`,
      [id, promptId, user, body, grade ? JSON.stringify(grade) : null]
    );
    return { id, createdAt, body, grade };
  }
  const all = await readJsonFile<WritingPromptRow[]>(writingFile(user), []);
  const p = all.find((x) => x.id === promptId);
  if (!p) return null;
  const attempt: WritingAttemptRow = { id, createdAt, body, grade };
  p.attempts.push(attempt);
  await writeJsonFile(writingFile(user), all);
  return attempt;
}

export async function deleteWritingPrompt(user: string, id: string): Promise<void> {
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    await pool.query(`DELETE FROM writing_prompts WHERE user_id = $1 AND id = $2`, [user, id]);
    return;
  }
  const all = await readJsonFile<WritingPromptRow[]>(writingFile(user), []);
  await writeJsonFile(writingFile(user), all.filter((p) => p.id !== id));
}
