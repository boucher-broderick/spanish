// Persistence for Course mode: cached lesson explanations, per-lesson chat history,
// and generated practice specs. Mirrors lib/composition-store.ts exactly — Postgres
// when DATABASE_URL is set, otherwise a per-user JSON file under ./.data. Node-only.
import "server-only";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getPool, USE_DB } from "./store";
import type { ChatMessage, ChatRole, ExplanationRow, PracticeSpec } from "./course";

export type { ChatMessage, ExplanationRow };

const DATA_DIR = path.join(process.cwd(), ".data");

// ---------------- schema (DB) ----------------
let ready: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const pool = await getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS lesson_explanations (
          user_id text NOT NULL,
          lesson_id text NOT NULL,
          body text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, lesson_id)
        );

        CREATE TABLE IF NOT EXISTS lesson_chats (
          id text PRIMARY KEY,
          lesson_id text NOT NULL,
          user_id text NOT NULL,
          role text NOT NULL,
          content text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS lesson_chats_scope ON lesson_chats (user_id, lesson_id, created_at);

        CREATE TABLE IF NOT EXISTS practice_specs (
          id text PRIMARY KEY,
          lesson_id text NOT NULL,
          user_id text NOT NULL,
          spec jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS practice_specs_scope ON practice_specs (user_id, lesson_id, created_at DESC);
      `);
    })();
  }
  return ready;
}

// ---------------- file backend helpers ----------------
interface CourseFile {
  explanations: Record<string, ExplanationRow>;
  chats: Record<string, ChatMessage[]>;
  specs: Record<string, PracticeSpec>; // latest spec per lesson
}
const EMPTY_FILE: CourseFile = { explanations: {}, chats: {}, specs: {} };

function courseFile(user: string): string {
  return path.join(DATA_DIR, `course-${user.replace(/[^a-z0-9_-]/gi, "_")}.json`);
}
async function readFile(user: string): Promise<CourseFile> {
  try {
    const raw = JSON.parse(await fs.readFile(courseFile(user), "utf8")) as Partial<CourseFile>;
    return { ...EMPTY_FILE, ...raw };
  } catch {
    return { ...EMPTY_FILE };
  }
}
async function writeFile(user: string, data: CourseFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(courseFile(user), JSON.stringify(data, null, 2));
}

// ================= EXPLANATIONS =================
export async function getExplanation(user: string, lessonId: string): Promise<ExplanationRow | null> {
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    const res = await pool.query(
      `SELECT lesson_id, body, created_at FROM lesson_explanations WHERE user_id = $1 AND lesson_id = $2`,
      [user, lessonId]
    );
    const r = res.rows[0];
    return r
      ? { lessonId: r.lesson_id, body: r.body, createdAt: new Date(r.created_at).toISOString() }
      : null;
  }
  const f = await readFile(user);
  return f.explanations[lessonId] ?? null;
}

export async function saveExplanation(user: string, lessonId: string, body: string): Promise<ExplanationRow> {
  const createdAt = new Date().toISOString();
  const row: ExplanationRow = { lessonId, body, createdAt };
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    await pool.query(
      `INSERT INTO lesson_explanations (user_id, lesson_id, body, created_at) VALUES ($1,$2,$3, now())
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET body = EXCLUDED.body, created_at = now()`,
      [user, lessonId, body]
    );
    return row;
  }
  const f = await readFile(user);
  f.explanations[lessonId] = row;
  await writeFile(user, f);
  return row;
}

// ================= CHAT =================
export async function getChat(user: string, lessonId: string): Promise<ChatMessage[]> {
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    const res = await pool.query(
      `SELECT id, role, content, created_at FROM lesson_chats
       WHERE user_id = $1 AND lesson_id = $2 ORDER BY created_at ASC`,
      [user, lessonId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      role: r.role as ChatRole,
      content: r.content,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }
  const f = await readFile(user);
  return f.chats[lessonId] ?? [];
}

export async function appendChatTurns(
  user: string,
  lessonId: string,
  turns: { role: ChatRole; content: string }[]
): Promise<ChatMessage[]> {
  const now = Date.now();
  const messages: ChatMessage[] = turns.map((t, i) => ({
    id: randomUUID(),
    role: t.role,
    content: t.content,
    // Stagger timestamps so ordering is stable within a single append.
    createdAt: new Date(now + i).toISOString(),
  }));
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    for (const m of messages) {
      await pool.query(
        `INSERT INTO lesson_chats (id, lesson_id, user_id, role, content, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [m.id, lessonId, user, m.role, m.content, m.createdAt]
      );
    }
    return messages;
  }
  const f = await readFile(user);
  f.chats[lessonId] = [...(f.chats[lessonId] ?? []), ...messages];
  await writeFile(user, f);
  return messages;
}

// ================= PRACTICE SPECS =================
export async function saveSpec(user: string, lessonId: string, spec: PracticeSpec): Promise<void> {
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    await pool.query(`INSERT INTO practice_specs (id, lesson_id, user_id, spec) VALUES ($1,$2,$3,$4)`, [
      randomUUID(),
      lessonId,
      user,
      JSON.stringify(spec),
    ]);
    return;
  }
  const f = await readFile(user);
  f.specs[lessonId] = spec; // file mode keeps only the latest
  await writeFile(user, f);
}

export async function getLatestSpec(user: string, lessonId: string): Promise<PracticeSpec | null> {
  if (USE_DB) {
    await ensureSchema();
    const pool = await getPool();
    const res = await pool.query(
      `SELECT spec FROM practice_specs WHERE user_id = $1 AND lesson_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [user, lessonId]
    );
    return res.rows[0] ? (res.rows[0].spec as PracticeSpec) : null;
  }
  const f = await readFile(user);
  return f.specs[lessonId] ?? null;
}
