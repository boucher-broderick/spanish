// Domain for Course mode: the curriculum content types, the generic practice-spec
// schema (the one format Gemini fills and the renderer grades), and the persisted
// row shapes. Framework-free and side-effect-free (like lib/composition.ts) so it
// is safe to import from client or server. Lesson/daily PROGRESS types live in
// lib/domain.ts next to ProgressState; this file is purely course content + practice.
import type { Level } from "./composition";

// ---------------- curriculum ----------------

export type LessonKind = "grammar" | "vocab";

// A lesson's word can reference the existing dataset by id, OR inline a
// lesson-specific word that isn't in data/words.json (e.g. reflexive verbs).
export interface LessonWord {
  wordId?: string; // -> data/words.json Word.id
  spanish?: string; // inline word (article included for nouns)
  english?: string;
  lemma?: string;
  pos?: string;
}

export interface Lesson {
  id: string; // stable slug, e.g. "u2-ser-vs-estar"
  unitId: string;
  order: number;
  kind: LessonKind;
  title: string;
  grammarTopic?: string; // present for kind==="grammar", e.g. "ser vs estar"
  summary: string; // one-line teaser on the course map
  words: LessonWord[]; // themed vocab (grammar) or the whole point (vocab chapter)
}

export interface Unit {
  id: string;
  order: number;
  title: string;
  blurb: string;
  lessonIds: string[]; // ordered
}

export interface Curriculum {
  version: number;
  level: string; // bridge label, e.g. "A1–A2"
  units: Unit[];
  lessons: Record<string, Lesson>;
}

// A LessonWord resolved against the dataset (or its inline fields), normalized so
// the gate + UI treat dataset and lesson-specific words uniformly. Inline words
// get a synthetic id so they still key into ProgressState.words.
export interface ResolvedWord {
  id: string;
  spanish: string;
  english: string;
  lemma: string;
  pos: string;
  inDataset: boolean; // false -> inline (synthetic id, can't drive Play yet)
}

// ---------------- gate targets ----------------

export const LESSON_WRITING_TARGET = 10;
export const LESSON_READING_TARGET = 10;
export const LESSON_LISTENING_TARGET = 10;
// The composition "pass" bar: writing score (0-100) and the fraction of quiz
// questions that must be correct for a reading/listening attempt to count.
export const COMPOSITION_PASS_SCORE = 80;
export const QUIZ_PASS_FRACTION = 0.6;
// How many recently-completed lessons feed the daily review.
export const DAILY_WINDOW = 3;

// The local calendar day (YYYY-MM-DD). Client-side this is the user's timezone;
// progress helpers take it as an argument so they stay pure.
export function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------- practice-spec schema (the centerpiece) ----------------

export type PracticeItemType =
  | "multipleChoice" // pick one of options[]
  | "chooseTwo" // 2-option contrast (ser/estar, por/para)
  | "fillBlank" // type the missing word
  | "fillBlankReason" // fill the blank AND justify why (reason is Gemini-graded)
  | "correction" // rewrite an erroneous sentence correctly
  | "translate"
  | "conjugate"
  | "transform" // rewrite per an instruction (make plural, negate, …)
  | "shortAnswer";

export type GradeMode = "exact" | "anyOf" | "gemini";

export interface PracticeItem {
  id: string; // unique within the spec, e.g. "i1"
  type: PracticeItemType;
  prompt: string; // the question/instruction (Spanish or mixed)
  prompt_en?: string; // optional English gloss
  options?: string[]; // multipleChoice / chooseTwo
  answer: string; // canonical correct answer (blank text, corrected sentence, …)
  acceptable?: string[]; // additional accepted strings (anyOf)
  grade: GradeMode; // how to grade the closed `answer`
  accentSensitive?: boolean; // false -> matchesLoose, true -> matchesStrict
  reasonPrompt?: string; // fillBlankReason: what to justify (always Gemini-graded)
  reasonAnswer?: string; // model reason (for the grader + reveal)
  explanation: string; // shown after grading
  meta?: { infinitive?: string; person?: string; tense?: string }; // conjugate hints
}

// Which generator tool produced a spec. The practice API takes this so the
// teacher/chatbot can pick the drill type per request.
export type PracticeKind = "fillBlank" | "fillBlankReason" | "writingPrompt" | "correction";

export const PRACTICE_KINDS: { id: PracticeKind; label: string; blurb: string }[] = [
  { id: "fillBlank", label: "Fill in the blank", blurb: "Type the missing word in each sentence." },
  { id: "fillBlankReason", label: "Fill + reason", blurb: "Pick the word and justify why." },
  { id: "writingPrompt", label: "Writing prompt", blurb: "One short open writing task." },
  { id: "correction", label: "Find the error", blurb: "Rewrite each sentence correctly." },
];

export interface PracticeSpec {
  lessonId: string;
  kind: PracticeKind;
  title: string;
  instructions: string; // short, English
  items: PracticeItem[];
}

// One graded item, returned by the renderer (local) or the grade route (Gemini).
export interface ItemResult {
  itemId: string;
  correct: boolean;
  reasonCorrect?: boolean; // fillBlankReason: was the justification right
  feedback?: string; // from Gemini for free-form; else derived
}

// ---------------- persisted row shapes (client-safe) ----------------

export interface ExplanationRow {
  lessonId: string;
  body: string; // textbook-style explanation (paragraphs separated by blank lines)
  createdAt: string;
}

export type ChatRole = "user" | "model";
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

// Per-lesson gate summary returned by GET /api/course (computed via lessonGate).
export interface LessonGateSummary {
  writing: { done: number; target: number };
  reading: { done: number; target: number };
  listening: { done: number; target: number };
  vocab: { done: number; total: number };
  passed: boolean;
}

// Re-exported so callers can pin a level for explanation/practice generation.
export type { Level };
