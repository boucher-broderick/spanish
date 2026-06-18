// Domain for the LLM-powered games (Chat, Writing, Reading, Listening): shared
// types (client + server) plus the Claude prompt builders + JSON schemas used
// server-side. Framework-free and side-effect-free so it's safe to import from
// either side. Ported from the old Gemini-era composition.ts, de-coupled from
// the removed conjugation/course modules (tenses inlined here).

// ---- CEFR levels ----
export const LEVELS = [
  { id: "A1", label: "A1 · Beginner" },
  { id: "A2", label: "A2 · Elementary" },
  { id: "B1", label: "B1 · Intermediate" },
  { id: "B2", label: "B2 · Upper int." },
  { id: "C1", label: "C1 · Advanced" },
] as const;
export type Level = (typeof LEVELS)[number]["id"];
export const DEFAULT_LEVEL: Level = "A2";

// ---- tenses (inlined — the old conjugation engine is gone) ----
export const TENSES = [
  { id: "any", label: "Any / mixed" },
  { id: "present", label: "Present" },
  { id: "preterite", label: "Preterite" },
  { id: "imperfect", label: "Imperfect" },
  { id: "future", label: "Future" },
  { id: "conditional", label: "Conditional" },
  { id: "present_subjunctive", label: "Present subjunctive" },
  { id: "present_perfect", label: "Present perfect" },
] as const;
export type Tense = (typeof TENSES)[number]["id"];
export const DEFAULT_TENSE: Tense = "any";

// ---- story length ----
export const STORY_LENGTHS = [
  { id: "short", label: "Short · ~1 paragraph", words: 120 },
  { id: "medium", label: "Medium · ~3 paragraphs", words: 300 },
  { id: "long", label: "Long · ~1 page", words: 700 },
] as const;
export type StoryLengthId = (typeof STORY_LENGTHS)[number]["id"];
export const DEFAULT_LENGTH: StoryLengthId = "medium";
export function lengthWords(id: StoryLengthId): number {
  return STORY_LENGTHS.find((l) => l.id === id)?.words ?? 300;
}

export interface Criteria {
  level: Level;
  tense: Tense;
  topic: string;
  length: StoryLengthId;
}
export const DEFAULT_CRITERIA: Criteria = { level: DEFAULT_LEVEL, tense: DEFAULT_TENSE, topic: "", length: DEFAULT_LENGTH };

export function levelLabel(id: string): string {
  return LEVELS.find((l) => l.id === id)?.label ?? id;
}
export function tenseLabel(id: string): string {
  return TENSES.find((t) => t.id === id)?.label ?? id;
}
export function lengthLabel(id: string): string {
  return STORY_LENGTHS.find((l) => l.id === id)?.label ?? id;
}

// ---- persisted row shapes ----
export interface QuizQuestion {
  q: string; // question (Spanish)
  a: string; // model answer (Spanish)
}
export interface StoryRow {
  id: string;
  createdAt: number;
  title: string;
  topic: string | null;
  level: Level;
  tense: Tense;
  length: StoryLengthId;
  body: string;
  quiz: QuizQuestion[];
  words: string[]; // section words woven in (for display)
}

export interface WritingGrade {
  score: number; // 0–100
  summary: string;
  strengths: string[];
  fixes: { wrong: string; better: string; why: string }[];
}
export interface WritingAttempt {
  id: string;
  createdAt: number;
  body: string;
  grade: WritingGrade;
}
export interface WritingPromptRow {
  id: string;
  createdAt: number;
  level: Level;
  tense: Tense;
  topic: string | null;
  prompt: string; // the task, in Spanish
  promptEn: string; // English gloss
  words: string[];
  attempts: WritingAttempt[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export interface ChatThread {
  id: string;
  createdAt: number;
  title: string;
  level: Level;
  words: string[];
  messages: ChatMessage[];
}

// =================== prompt builders ===================

function levelPhrase(level: Level): string {
  const map: Record<Level, string> = {
    A1: "A1 (absolute beginner): very short, simple present-tense sentences, ~500 most-common words, lots of repetition",
    A2: "A2 (elementary): simple connected sentences, common everyday vocabulary, basic past/future",
    B1: "B1 (intermediate): clear connected text on familiar topics, some subordinate clauses, moderate vocabulary",
    B2: "B2 (upper-intermediate): detailed text, varied connectors, idiomatic but not obscure vocabulary, subjunctive where natural",
    C1: "C1 (advanced): fluent, nuanced, complex structures, rich and precise vocabulary, idioms",
  };
  return map[level];
}

function tensePhrase(t: Tense): string {
  if (t === "any") return "any natural mix of tenses";
  const label = tenseLabel(t);
  return `primarily the ${label} tense (use it heavily and correctly; other tenses only where natural)`;
}

function wordBankLine(words?: string[]): string {
  if (!words?.length) return "";
  return `\nWhere it reads naturally, weave in these words the learner is studying (don't force every one): ${words.slice(0, 30).join(", ")}.`;
}

// ---- writing prompt ----
export const WRITING_PROMPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    topic: { type: "string" },
    prompt: { type: "string" },
    prompt_en: { type: "string" },
  },
  required: ["topic", "prompt", "prompt_en"],
} as const;
export interface WritingPromptResult { topic: string; prompt: string; prompt_en: string }

export function buildWritingPromptPrompt(p: { level: Level; tense: Tense; topic?: string; words?: string[] }): string {
  const topicLine = p.topic?.trim()
    ? `The topic MUST be about: "${p.topic.trim()}".`
    : `Invent a specific, engaging topic — avoid clichés like "mi familia" or "mis vacaciones".`;
  return `You design Spanish writing prompts for a learner.
Learner level: ${levelPhrase(p.level)}.
They will write using ${tensePhrase(p.tense)}.
${topicLine}${wordBankLine(p.words)}

Produce ONE engaging writing prompt (2–4 sentences) that naturally pushes the learner to use that tense, calibrated to their level. Write the prompt itself in Spanish, at or slightly below their level. Also give a one-line English gloss and a short topic label.`;
}

// ---- writing grade ----
export const WRITING_GRADE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer" },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    fixes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { wrong: { type: "string" }, better: { type: "string" }, why: { type: "string" } },
        required: ["wrong", "better", "why"],
      },
    },
  },
  required: ["score", "summary", "strengths", "fixes"],
} as const;

export function buildGradePrompt(p: { level: Level; tense: Tense; prompt: string; body: string }): string {
  return `You are a supportive but precise Spanish teacher grading a learner's writing.
Learner level: ${levelPhrase(p.level)}. Target tense focus: ${tensePhrase(p.tense)}.

The writing prompt was:
"""${p.prompt}"""

The learner wrote:
"""${p.body}"""

Grade it. Give a score from 0–100 calibrated to their level (not native-speaker perfection). Provide a one or two sentence summary, a few specific strengths, and a list of concrete fixes — each with the learner's wrong text, a better version, and a brief reason in English. Be encouraging and concrete. If the writing is strong, it's fine to return few or no fixes.`;
}

// ---- story (Reading / Listening) ----
export const STORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    topic: { type: "string" },
    body: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { q: { type: "string" }, a: { type: "string" } },
        required: ["q", "a"],
      },
    },
  },
  required: ["title", "topic", "body", "questions"],
} as const;
export interface StoryResult { title: string; topic: string; body: string; questions: QuizQuestion[] }

export function buildStoryPrompt(p: { level: Level; tense: Tense; topic?: string; words?: number; include?: string[] }): string {
  const topicLine = p.topic?.trim()
    ? `The story MUST be about: "${p.topic.trim()}".`
    : `Invent a specific, vivid topic — avoid clichés.`;
  return `You write short Spanish stories for a language learner to read and listen to.
Learner level: ${levelPhrase(p.level)}.
Use ${tensePhrase(p.tense)}.
${topicLine}${wordBankLine(p.include)}

Write a coherent story of about ${p.words ?? 300} words, in Spanish, calibrated to the learner's level (clear, natural, not childish). Separate paragraphs with blank lines.
Then write 3–5 open-ended comprehension questions in Spanish, each with a concise model answer in Spanish. Also give a short title and a one-word-ish topic label.`;
}

// ---- chat ----
export function chatSystemPrompt(p: { level: Level; words?: string[] }): string {
  const wb = p.words?.length
    ? ` Gently steer the conversation so the learner encounters and reuses these words they're studying: ${p.words.slice(0, 30).join(", ")}.`
    : "";
  return `You are a friendly Spanish conversation partner for a ${levelPhrase(p.level)} learner.
Converse ENTIRELY in Spanish, calibrated to their level — keep sentences clear and not too long.${wb}
Keep your replies short (1–3 sentences) and always end with a question to keep the conversation going.
If the learner makes a notable mistake, gently model the correct phrasing in your reply (don't lecture). Stay in character as a conversation partner — do not break into English unless the learner explicitly asks for a translation.`;
}

// ---- help panel (ask an LLM) ----
export function helpSystemPrompt(context?: string): string {
  const ctx = context ? `\n\nThe learner is currently on this page of the app: ${context}. If their question relates to it, take that into account.` : "";
  return `You are a concise, encouraging Spanish grammar tutor embedded in a study app built around the textbook "Practice Makes Perfect: Complete Spanish Grammar".
Answer the learner's questions clearly in English, with short Spanish examples where useful. Keep answers focused and not overly long — a few short paragraphs or a tight list at most. Use simple formatting.${ctx}`;
}
