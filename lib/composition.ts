// Domain for the Writing / Reading / Listening sections: shared types (used by
// client + server) and the Gemini prompt builders (used server-side only).
// Framework-free and side-effect-free so it is safe to import from either side.
import { TENSES, Tense } from "./conjugation/types";

// ---- CEFR levels ----
export const LEVELS = [
  { id: "A1", label: "A1 · Beginner" },
  { id: "A2", label: "A2 · Elementary" },
  { id: "B1", label: "B1 · Intermediate" },
  { id: "B2", label: "B2 · Upper int." },
  { id: "C1", label: "C1 · Advanced" },
  { id: "C2", label: "C2 · Mastery" },
] as const;
export type Level = (typeof LEVELS)[number]["id"];
export const DEFAULT_LEVEL: Level = "B1";

// ---- story length ----
export const STORY_LENGTHS = [
  { id: "short", label: "Short · ~1 page", words: 250 },
  { id: "medium", label: "Medium · ~2 pages", words: 600 },
  { id: "long", label: "Long · ~5 pages", words: 1500 },
] as const;
export type StoryLengthId = (typeof STORY_LENGTHS)[number]["id"];
export const DEFAULT_LENGTH: StoryLengthId = "medium";
export function lengthWords(id: StoryLengthId): number {
  return STORY_LENGTHS.find((l) => l.id === id)?.words ?? 600;
}

// ---- tense selection ----
// Composition uses the conjugation tenses plus an "any" escape hatch.
export type CompTense = Tense | "any";
export const COMP_TENSES: { id: CompTense; label: string }[] = [
  { id: "any", label: "Any / mixed" },
  ...TENSES.map((t) => ({ id: t.id as CompTense, label: t.label })),
];
export const DEFAULT_TENSE: CompTense = "any";

function tensePhrase(t: CompTense): string {
  if (t === "any") return "any natural mix of tenses";
  const label = TENSES.find((x) => x.id === t)?.label ?? t;
  return `primarily the ${label} tense (use it heavily and correctly; other tenses only where natural)`;
}

function levelPhrase(level: Level): string {
  const map: Record<Level, string> = {
    A1: "A1 (absolute beginner): very short simple sentences, present tense, ~500 most-common words, lots of repetition",
    A2: "A2 (elementary): simple connected sentences, common everyday vocabulary, basic past/future",
    B1: "B1 (intermediate): clear connected text on familiar topics, some subordinate clauses, moderate vocabulary",
    B2: "B2 (upper-intermediate): detailed text, varied connectors, idiomatic but not obscure vocabulary, subjunctive where natural",
    C1: "C1 (advanced): fluent, nuanced, complex structures, rich and precise vocabulary, idioms",
    C2: "C2 (mastery): native-like, sophisticated register, subtle nuance and stylistic range",
  };
  return map[level];
}

// ================= WRITING =================

export interface WritingPromptResult {
  topic: string; // short topic label
  prompt: string; // the writing task, in Spanish
  prompt_en: string; // English gloss of the task
}

// `spice` is a caller-supplied random seed/keyword to force high variance across
// generations even with the same level/tense.
export function buildWritingPromptPrompt(p: {
  level: Level;
  tense: CompTense;
  topic?: string;
  spice: string;
}): string {
  const topicLine = p.topic?.trim()
    ? `The topic MUST be about: "${p.topic.trim()}".`
    : `Invent a SURPRISING, specific, high-variance topic — avoid clichés like "mi familia" or "mis vacaciones". Randomness seed to push you somewhere unexpected: "${p.spice}". Lean into the unusual.`;
  return `You design Spanish writing prompts for a learner.
Learner level: ${levelPhrase(p.level)}.
They will write using ${tensePhrase(p.tense)}.
${topicLine}

Produce ONE engaging writing prompt (2-4 sentences) that naturally pushes the learner to use that tense, calibrated to their level. The prompt itself is written in Spanish at or slightly below their level.

Reply with ONLY this JSON:
{"topic":"<3-6 word topic label in English>","prompt":"<the writing task in Spanish>","prompt_en":"<the same task in English>"}`;
}

export interface WritingError {
  original: string; // the learner's text that was wrong
  correction: string; // the fixed version
  explanation: string; // short, why
  type: string; // e.g. "conjugation", "gender", "spelling", "word order", "vocabulary"
}
export interface WritingGrade {
  score: number; // 0-100, calibrated to their level
  level_estimate: string; // CEFR level the writing actually demonstrates
  summary: string; // 1-2 sentence overall feedback (English)
  errors: WritingError[];
  corrected: string; // full corrected version of their text
}

export function buildGradePrompt(p: {
  level: Level;
  tense: CompTense;
  prompt: string;
  body: string;
}): string {
  return `You are a strict but encouraging Spanish teacher grading a learner's writing.
Learner target level: ${levelPhrase(p.level)}.
Target tense focus: ${tensePhrase(p.tense)}.

The writing prompt was:
"""${p.prompt.trim()}"""

The learner wrote:
"""${p.body.trim()}"""

Grade calibrated to THEIR level (don't penalize for not writing above their level, but do correct every actual error: grammar, conjugation, gender/agreement, spelling/accents, word order, word choice). Then provide a fully corrected version that keeps their meaning and stays at their level.

Reply with ONLY this JSON:
{"score":<0-100>,"level_estimate":"<A1-C2>","summary":"<1-2 sentences in English>","errors":[{"original":"<their text>","correction":"<fixed>","explanation":"<short, English>","type":"<conjugation|gender|spelling|word order|vocabulary|other>"}],"corrected":"<full corrected Spanish text>"}
If there are no errors, return an empty "errors" array.`;
}

// ================= READING / STORIES =================

export interface QuizQuestion {
  question: string; // open-ended, in Spanish
  reference_answer: string; // a model answer, in Spanish (for self-check)
}
export interface StoryResult {
  title: string;
  topic: string;
  body: string; // the story, in Spanish
  questions: QuizQuestion[];
}

export function buildStoryPrompt(p: {
  level: Level;
  tense: CompTense;
  topic?: string;
  words: number;
  spice: string;
}): string {
  const topicLine = p.topic?.trim()
    ? `The story MUST be about: "${p.topic.trim()}".`
    : `Invent a SURPRISING, specific, high-variance premise — avoid clichés. Randomness seed to push you somewhere unexpected: "${p.spice}".`;
  return `You write engaging Spanish short stories for a learner to read.
Learner level: ${levelPhrase(p.level)}.
Write the story using ${tensePhrase(p.tense)}.
${topicLine}
Target length: about ${p.words} words. Use paragraphs (separate them with blank lines). Make it genuinely interesting with a beginning, middle, and end.

Then write 4-6 OPEN-ENDED comprehension questions in Spanish (not yes/no, not multiple choice) that require understanding the story, plus a concise model answer for each.

Reply with ONLY this JSON:
{"title":"<Spanish title>","topic":"<3-6 word topic label in English>","body":"<the full story in Spanish, paragraphs separated by \\n\\n>","questions":[{"question":"<open-ended question in Spanish>","reference_answer":"<concise model answer in Spanish>"}]}`;
}

// Grading a learner's open-ended quiz answers (used by Reading + Listening quiz mode).
export interface AnswerGrade {
  index: number;
  correct: boolean;
  feedback: string; // short, English
}

// ================= persisted row shapes (client-safe) =================
export interface StoryRow {
  id: string;
  createdAt: string;
  title: string;
  topic: string | null;
  level: string;
  tense: string;
  length: string;
  body: string;
  quiz: QuizQuestion[];
  hasAudio: boolean;
}
export interface WritingAttemptRow {
  id: string;
  createdAt: string;
  body: string;
  grade: WritingGrade | null;
}
export interface WritingPromptRow {
  id: string;
  createdAt: string;
  level: string;
  tense: string;
  topic: string | null;
  prompt: string;
  promptEn: string | null;
  attempts: WritingAttemptRow[];
}
export function buildAnswerGradePrompt(p: {
  level: Level;
  body: string;
  qa: { question: string; reference: string; answer: string }[];
}): string {
  const items = p.qa
    .map(
      (q, i) =>
        `${i}. Q: ${q.question}\n   Model answer: ${q.reference}\n   Learner answer: ${q.answer || "(blank)"}`
    )
    .join("\n");
  return `You grade a Spanish learner's open-ended answers about a story they read/heard.
Be fair: an answer is correct if it captures the right meaning, even with minor grammar slips or different wording. Blank or off-topic answers are incorrect.
Learner level: ${levelPhrase(p.level)}.

Story:
"""${p.body.trim()}"""

Questions and answers:
${items}

Reply with ONLY this JSON:
{"results":[{"index":<n>,"correct":<bool>,"feedback":"<short English note, mention the right idea if wrong>"}]}
One entry per question, using the exact index shown.`;
}
