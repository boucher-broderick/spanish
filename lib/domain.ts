// App-level domain types and constants shared by UI + logic.
import type { Tense } from "./conjugation/types";

export type Mode = "learn" | "freeplay" | "review";

export type ExerciseId =
  | "conjugation"
  | "fillWord"
  | "fillSentence"
  | "wordBank"
  | "spelling"
  | "flashcards";

export interface ExerciseDef {
  id: ExerciseId;
  label: string;
  blurb: string;
  counts: boolean; // counts toward the 3-exercise mastery rule
  verbsOnly?: boolean;
}

export const EXERCISES: ExerciseDef[] = [
  {
    id: "conjugation",
    label: "Verb Conjugation",
    blurb: "Type each person across your selected tenses.",
    counts: true,
    verbsOnly: true,
  },
  {
    id: "fillWord",
    label: "Fill in the Word",
    blurb: "Given an English word + sentence, type the full Spanish word.",
    counts: true,
  },
  {
    id: "fillSentence",
    label: "Fill in the Sentence",
    blurb: "Complete a Spanish sentence with the missing word.",
    counts: true,
  },
  {
    id: "wordBank",
    label: "Word Bank",
    blurb: "Use a set of words in a paragraph, graded by an LLM.",
    counts: true,
  },
  {
    id: "spelling",
    label: "Spelling",
    blurb: "Hear the meaning, type the Spanish spelling (accents count).",
    counts: true,
  },
  {
    id: "flashcards",
    label: "Flashcards",
    blurb: "Just learn — flip to reveal. No scoring.",
    counts: false,
  },
];

export const COUNTING_EXERCISES: ExerciseId[] = EXERCISES.filter((e) => e.counts).map((e) => e.id);

export const CATEGORIES = [
  "Pronouns",
  "Nouns",
  "Adjectives",
  "Verbs",
  "Adverbs",
  "Prepositions",
  "Conjunctions",
  "Interjections",
] as const;
export type Category = (typeof CATEGORIES)[number];

// ---- the three play groups ----
// The app collapses the 8 word categories into three groups.
export const GROUPS = ["Nouns", "Verbs", "Other"] as const;
export type Group = (typeof GROUPS)[number];

export function groupForCategory(c: Category): Group {
  if (c === "Nouns") return "Nouns";
  if (c === "Verbs") return "Verbs";
  return "Other";
}

// The single scoring game that drives mastery for each group.
// (Flashcards never scores; Word Bank is dead code for now.)
export const GROUP_MAIN_GAME: Record<Group, ExerciseId> = {
  Nouns: "spelling",
  Verbs: "conjugation",
  Other: "spelling",
};

// The games offered per group (main scoring game first, then flashcards).
export const GROUP_GAMES: Record<Group, ExerciseId[]> = {
  Nouns: ["spelling", "flashcards"],
  Verbs: ["conjugation", "flashcards"],
  Other: ["spelling", "flashcards"],
};

// ---- mastery thresholds ----
// A word graduates to review at >=10 attempts AND >=80% in its group's main game.
export const MIN_ATTEMPTS = 10;
export const MIN_ACCURACY = 0.8;
export const ROUND_SIZE = 10; // words shown per round
export const SET_SIZE = 20; // active Learn set: top-N unmastered by rank
export const DEFAULT_WORD_BANK_COUNT = 6; // dead code (Word Bank)

export type TimeMode = "number" | "english";
export type NumbersStep = 1 | 10 | 100 | 1000;

export interface Word {
  id: string;
  rank: number;
  categoryRank: number;
  category: Category;
  pos: string;
  spanish: string; // includes article for nouns
  english: string;
  lemma: string; // bare word (no article); infinitive for verbs
  article: string | null;
  gender: string | null;
  verbGroup: "ar" | "er" | "ir" | null;
}

export interface Stat {
  attempts: number;
  correct: number;
}
export interface WordProgress {
  review: boolean;
  stats: Partial<Record<ExerciseId, Stat>>;
}
export interface Settings {
  tenses: Tense[];
  wordBankCount: number;
  timeMode: TimeMode;
  numbersMin: number;
  numbersMax: number;
  numbersStep: NumbersStep;
}
export interface ProgressState {
  version: number;
  settings: Settings;
  words: Record<string, WordProgress>;
}

export const DEFAULT_SETTINGS: Settings = {
  tenses: ["present", "preterite"],
  wordBankCount: DEFAULT_WORD_BANK_COUNT,
  timeMode: "number",
  numbersMin: 1,
  numbersMax: 100,
  numbersStep: 1,
};

export function emptyState(): ProgressState {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, words: {} };
}
