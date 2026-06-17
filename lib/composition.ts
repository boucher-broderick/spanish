// Domain for the Writing / Reading / Listening sections: shared types (used by
// client + server) and the Gemini prompt builders (used server-side only).
// Framework-free and side-effect-free so it is safe to import from either side.
import { TENSES, Tense } from "./conjugation/types";
import type { ChatMessage, ItemResult, Lesson, PracticeItem, PracticeKind, PracticeSpec, ResolvedWord } from "./course";

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
// `include` is an optional word-bank: Spanish words the prompt should nudge the
// learner to use (course words, for spaced exposure). Soft, not exclusive.
function wordBankLine(include?: string[]): string {
  if (!include?.length) return "";
  return `\nWhere natural, gently steer the learner toward reusing these words they're studying (don't force all of them): ${include.slice(0, 40).join(", ")}.`;
}

export function buildWritingPromptPrompt(p: {
  level: Level;
  tense: CompTense;
  topic?: string;
  spice: string;
  include?: string[];
}): string {
  const topicLine = p.topic?.trim()
    ? `The topic MUST be about: "${p.topic.trim()}".`
    : `Invent a SURPRISING, specific, high-variance topic — avoid clichés like "mi familia" or "mis vacaciones". Randomness seed to push you somewhere unexpected: "${p.spice}". Lean into the unusual.`;
  return `You design Spanish writing prompts for a learner.
Learner level: ${levelPhrase(p.level)}.
They will write using ${tensePhrase(p.tense)}.
${topicLine}${wordBankLine(p.include)}

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
  include?: string[];
}): string {
  const topicLine = p.topic?.trim()
    ? `The story MUST be about: "${p.topic.trim()}".`
    : `Invent a SURPRISING, specific, high-variance premise — avoid clichés. Randomness seed to push you somewhere unexpected: "${p.spice}".`;
  return `You write engaging Spanish short stories for a learner to read.
Learner level: ${levelPhrase(p.level)}.
Write the story using ${tensePhrase(p.tense)}.
${topicLine}${wordBankLine(p.include)}
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
  lessonId?: string | null; // course lesson this story belongs to (null = free practice)
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

// ================= COURSE MODE =================
// Builders for the guided course: lesson explanations, the practice-spec generator
// tools (fill-blank / fill-blank+reason / writing prompt / correction), the chat
// teacher, and the batched free-form practice grader. All return prompt strings used
// with generateText / generateJson, matching the JSON conventions above.

// The course targets a learner bridging A1 into A2.
const COURSE_LEVEL_PHRASE =
  "a learner bridging A1 into A2: they know the present tense and core high-frequency vocabulary, " +
  "and are now solidifying tricky concepts. Keep language simple and clear, explain in English, and " +
  "give Spanish examples with English glosses";

function wordListBlock(words: ResolvedWord[]): string {
  if (!words.length) return "(no specific vocabulary)";
  return words.map((w) => `- ${w.spanish}${w.english ? ` (${w.english})` : ""}`).join("\n");
}

function lessonFocus(lesson: Lesson): string {
  return lesson.kind === "grammar" && lesson.grammarTopic
    ? `Grammar focus: ${lesson.grammarTopic}.`
    : `This is a vocabulary chapter titled "${lesson.title}".`;
}

// ---- lesson vocab pack (one example sentence per word) ----
export function buildLessonVocabPrompt(p: { lesson: Lesson; words: ResolvedWord[] }): string {
  const list = p.words.map((w) => `- id "${w.id}": ${w.spanish} (${w.english})`).join("\n");
  return `You write example sentences for a Spanish vocabulary list, for ${COURSE_LEVEL_PHRASE}.
For EACH word below, write ONE short, natural Spanish sentence that uses the word clearly (so the meaning is obvious from context), plus an English translation. Keep sentences simple and at the learner's level.

Words:
${list}

Reply with ONLY this JSON:
{"items":[{"id":"<the exact id>","example":"<Spanish sentence using the word>","example_en":"<English translation>"}]}
One entry per word, using the exact id shown.`;
}

// ---- lesson explanation (prose, rendered by StoryBody) ----
export function buildLessonExplanationPrompt(p: { lesson: Lesson; words: ResolvedWord[] }): string {
  const { lesson, words } = p;
  return `You are a friendly, clear Spanish teacher writing a textbook-style lesson for ${COURSE_LEVEL_PHRASE}.

Lesson title: "${lesson.title}".
${lessonFocus(lesson)}

The lesson's target vocabulary:
${wordListBlock(words)}

Write the explanation in English with Spanish examples. Structure it as a few short sections separated by BLANK LINES (no markdown headings symbols needed, but a short bold-free title line per section is fine). Cover:
${
    lesson.kind === "grammar"
      ? `1) what the concept is and when to use it, with a simple rule of thumb;
2) 3-5 example sentences in Spanish, each followed by its English translation in parentheses;
3) the most common mistakes learners make;
4) how the target vocabulary above fits into this concept.`
      : `1) a short intro to the theme;
2) each target word with a natural example sentence in Spanish and its English translation;
3) any gender/usage notes worth knowing.`
  }

Keep it focused and encouraging — about 250-400 words. Separate paragraphs with a blank line. Output PLAIN TEXT only (no JSON, no code fences).`;
}

// ---- practice generator tools ----
// Shared description of the spec JSON the renderer understands. Each tool appends
// its own item-type guidance, then asks for this exact shape.
const PRACTICE_SCHEMA_DOC = `Reply with ONLY this JSON shape:
{"title":"<short title>","instructions":"<one short English line>","items":[ ITEM, ITEM, ... ]}
Each ITEM is an object. Common fields: "id" (unique like "i1"), "type", "prompt" (the question/sentence shown to the learner), "answer" (the canonical correct answer), "grade" ("exact"|"anyOf"|"gemini"), "explanation" (why the answer is right, English). Optional: "prompt_en", "options" (array), "acceptable" (array of other accepted answers), "accentSensitive" (bool).`;

export function buildPracticePrompt(p: {
  lesson: Lesson;
  words: ResolvedWord[];
  kind: PracticeKind;
  count: number;
  spice: string;
}): string {
  const { lesson, words, kind, count, spice } = p;
  const header = `You design Spanish practice for ${COURSE_LEVEL_PHRASE}.
Lesson: "${lesson.title}". ${lessonFocus(lesson)}
Use this target vocabulary where natural:
${wordListBlock(words)}
Variety seed (make the items feel fresh, don't reuse stock examples): "${spice}".`;

  let task: string;
  if (kind === "fillBlank") {
    task = `Create ${count} fill-in-the-blank items. Each sentence is in Spanish with exactly one blank written as "___". The learner types the missing word.
For each item: "type":"fillBlank", "grade":"anyOf", put the correct word in "answer" and any equally-correct variants in "acceptable", set "accentSensitive":false. The "prompt" is the Spanish sentence with the "___". Add a short "explanation".`;
  } else if (kind === "fillBlankReason") {
    task = `Create ${count} fill-in-the-blank items where the learner ALSO justifies their choice (ideal for contrasts like ser/estar or por/para).
For each item: "type":"fillBlankReason", "grade":"anyOf", "answer" = the correct word (+ "acceptable" variants), "accentSensitive":false, the "prompt" is the Spanish sentence with "___". ALSO include "reasonPrompt" (a short question like "Why ser and not estar here?") and "reasonAnswer" (the model justification in English). Add a short "explanation".`;
  } else if (kind === "correction") {
    task = `Create ${count} error-correction items. Each "prompt" is a Spanish sentence containing exactly ONE planted error (wrong verb choice, agreement, conjugation, or word). The learner rewrites the WHOLE sentence correctly.
For each item: "type":"correction", "grade":"anyOf", "answer" = the fully corrected sentence (+ "acceptable" for valid alternative corrections), "accentSensitive":false. The "explanation" names the error and the fix.`;
  } else {
    // writingPrompt -> a single open task graded by Gemini
    task = `Create exactly ONE open writing task tied to this lesson. The learner writes 3-5 Spanish sentences.
Return a single item: "type":"shortAnswer", "grade":"gemini", "prompt" = the task written in Spanish (with an English gloss in "prompt_en"), "answer" = a brief model response in Spanish, "explanation" = what a good answer should demonstrate.`;
  }

  return `${header}\n\n${task}\n\n${PRACTICE_SCHEMA_DOC}`;
}

// ---- chat teacher ----
export interface ChatReply {
  reply: string; // the teacher's answer, in clear English with Spanish examples
  suggestPractice?: { kind: PracticeKind; count?: number };
}

export function buildChatTurnPrompt(p: {
  lesson: Lesson;
  explanation: string | null;
  history: ChatMessage[];
  userMessage: string;
}): string {
  const { lesson, explanation, history, userMessage } = p;
  const transcript = history
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Student" : "Teacher"}: ${m.content}`)
    .join("\n");
  return `You are a patient Spanish teacher helping a student with the lesson "${lesson.title}". ${lessonFocus(lesson)}
You are teaching ${COURSE_LEVEL_PHRASE}.

${explanation ? `The student has read this lesson explanation:\n"""${explanation.slice(0, 2000)}"""\n` : ""}${
    transcript ? `Conversation so far:\n${transcript}\n` : ""
  }
The student now says: "${userMessage}"

Answer helpfully and concisely in English, using Spanish examples with glosses where useful. If the student would clearly benefit from doing a drill now, set "suggestPractice" with a "kind" of "fillBlank", "fillBlankReason", "writingPrompt", or "correction" (otherwise omit it).

Reply with ONLY this JSON:
{"reply":"<your answer in English>","suggestPractice":{"kind":"<one of the four>","count":8}}
Omit "suggestPractice" entirely if a drill isn't warranted.`;
}

// ---- batched free-form practice grader ----
export interface GradeRequestItem {
  id: string;
  type: string;
  prompt: string;
  answer: string; // canonical answer
  response: string; // learner's answer
  reasonPrompt?: string;
  reasonAnswer?: string;
  reasonResponse?: string;
}

export function buildPracticeGradePrompt(p: { items: GradeRequestItem[] }): string {
  const items = p.items
    .map((it, i) => {
      const base = `${i}. id=${it.id} [${it.type}]\n   Task: ${it.prompt}\n   Model answer: ${it.answer}\n   Learner answer: ${it.response || "(blank)"}`;
      const reason =
        it.reasonPrompt != null
          ? `\n   Reason asked: ${it.reasonPrompt}\n   Model reason: ${it.reasonAnswer ?? ""}\n   Learner reason: ${it.reasonResponse || "(blank)"}`
          : "";
      return base + reason;
    })
    .join("\n");
  return `You grade a Spanish learner's practice answers. Be fair: an answer is correct if it conveys the right meaning with acceptable grammar, even if worded differently from the model answer. Blank or off-topic answers are incorrect.

Items:
${items}

For each item return whether the main answer is correct, and (only when a "Reason asked" was given) whether the learner's reason is correct.

Reply with ONLY this JSON:
{"results":[{"itemId":"<id>","correct":<bool>,"reasonCorrect":<bool or omit>,"feedback":"<short English note, mention the right idea if wrong>"}]}
One entry per item, using the exact id shown.`;
}

export type { ItemResult, PracticeItem, PracticeSpec };
