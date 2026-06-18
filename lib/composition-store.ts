// Persistence for the LLM games (stories, writing prompts/attempts, chat
// threads). Rides the generic per-user JSONB store in lib/store.ts (Postgres
// when DATABASE_URL is set, else a local JSON file) under a single
// `composition` namespace — no dedicated tables, no schema migration.
// Node-only — never import from edge/middleware.
import "server-only";
import { randomUUID } from "node:crypto";
import { loadState, saveState, type AppState } from "./store";
import type {
  ChatMessage,
  ChatThread,
  StoryRow,
  WritingAttempt,
  WritingGrade,
  WritingPromptRow,
} from "./composition";

interface CompositionState {
  stories: StoryRow[];
  writing: WritingPromptRow[];
  chats: ChatThread[];
}

function emptyComposition(): CompositionState {
  return { stories: [], writing: [], chats: [] };
}

async function load(user: string): Promise<{ state: AppState; comp: CompositionState }> {
  const state = await loadState(user);
  const comp = { ...emptyComposition(), ...((state.composition as Partial<CompositionState>) ?? {}) };
  return { state, comp };
}

async function persist(user: string, state: AppState, comp: CompositionState): Promise<void> {
  await saveState(user, { ...state, composition: comp });
}

// ---------------- stories ----------------
export async function listStories(user: string): Promise<StoryRow[]> {
  const { comp } = await load(user);
  return [...comp.stories].sort((a, b) => b.createdAt - a.createdAt);
}

export async function createStory(user: string, story: Omit<StoryRow, "id" | "createdAt">): Promise<StoryRow> {
  const { state, comp } = await load(user);
  const row: StoryRow = { ...story, id: randomUUID(), createdAt: Date.now() };
  comp.stories = [row, ...comp.stories];
  await persist(user, state, comp);
  return row;
}

export async function deleteStory(user: string, id: string): Promise<void> {
  const { state, comp } = await load(user);
  comp.stories = comp.stories.filter((s) => s.id !== id);
  await persist(user, state, comp);
}

// ---------------- writing ----------------
export async function listWriting(user: string): Promise<WritingPromptRow[]> {
  const { comp } = await load(user);
  return [...comp.writing].sort((a, b) => b.createdAt - a.createdAt);
}

export async function createPrompt(user: string, prompt: Omit<WritingPromptRow, "id" | "createdAt" | "attempts">): Promise<WritingPromptRow> {
  const { state, comp } = await load(user);
  const row: WritingPromptRow = { ...prompt, id: randomUUID(), createdAt: Date.now(), attempts: [] };
  comp.writing = [row, ...comp.writing];
  await persist(user, state, comp);
  return row;
}

export async function addWritingAttempt(user: string, promptId: string, body: string, grade: WritingGrade): Promise<WritingAttempt | null> {
  const { state, comp } = await load(user);
  const prompt = comp.writing.find((p) => p.id === promptId);
  if (!prompt) return null;
  const attempt: WritingAttempt = { id: randomUUID(), createdAt: Date.now(), body, grade };
  prompt.attempts = [...prompt.attempts, attempt];
  await persist(user, state, comp);
  return attempt;
}

export async function deletePrompt(user: string, id: string): Promise<void> {
  const { state, comp } = await load(user);
  comp.writing = comp.writing.filter((p) => p.id !== id);
  await persist(user, state, comp);
}

// ---------------- chat threads ----------------
export async function listChats(user: string): Promise<ChatThread[]> {
  const { comp } = await load(user);
  return [...comp.chats].sort((a, b) => b.createdAt - a.createdAt);
}

/** Create a thread or overwrite an existing one (by id) with the latest messages. */
export async function saveChat(
  user: string,
  thread: { id?: string; title: string; level: ChatThread["level"]; words: string[]; messages: ChatMessage[] }
): Promise<ChatThread> {
  const { state, comp } = await load(user);
  const existing = thread.id ? comp.chats.find((c) => c.id === thread.id) : undefined;
  if (existing) {
    existing.title = thread.title;
    existing.words = thread.words;
    existing.messages = thread.messages;
    await persist(user, state, comp);
    return existing;
  }
  const row: ChatThread = {
    id: thread.id ?? randomUUID(),
    createdAt: Date.now(),
    title: thread.title,
    level: thread.level,
    words: thread.words,
    messages: thread.messages,
  };
  comp.chats = [row, ...comp.chats];
  await persist(user, state, comp);
  return row;
}

export async function deleteChat(user: string, id: string): Promise<void> {
  const { state, comp } = await load(user);
  comp.chats = comp.chats.filter((c) => c.id !== id);
  await persist(user, state, comp);
}
