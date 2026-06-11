// Runtime word store. The dataset is loaded once from /api/words (Postgres, or
// the file fallback) and installed via initWords() — see components/WordsGate.tsx.
// `WORDS` is a live binding, so importers see the populated array after init.
// Sentences stay bundled (only the dead-code Fill exercises read them).
import sentencesData from "@/data/sentences.json";
import { Category, Group, SET_SIZE, Word, groupForCategory } from "./domain";

export let WORDS: Word[] = [];
let BY_ID = new Map<string, Word>();

export function initWords(words: Word[]): void {
  WORDS = words;
  BY_ID = new Map(words.map((w) => [w.id, w]));
}
export function wordsLoaded(): boolean {
  return WORDS.length > 0;
}

export function wordById(id: string): Word | undefined {
  return BY_ID.get(id);
}

export function wordsByCategory(category: Category): Word[] {
  return WORDS.filter((w) => w.category === category).sort((a, b) => a.rank - b.rank);
}

export function wordsByGroup(group: Group): Word[] {
  return WORDS.filter((w) => groupForCategory(w.category) === group).sort((a, b) => a.rank - b.rank);
}

export function categoryCount(category: Category): number {
  return WORDS.filter((w) => w.category === category).length;
}

export function groupCount(group: Group): number {
  return WORDS.filter((w) => groupForCategory(w.category) === group).length;
}

// 0-based 20-word set index within the word's group (ordered by rank).
export function groupSetIndex(word: Word): number {
  const ordered = wordsByGroup(groupForCategory(word.category));
  const idx = ordered.findIndex((w) => w.id === word.id);
  return idx < 0 ? 0 : Math.floor(idx / SET_SIZE);
}

// ---- example sentences (generated; only the dead-code Fill exercises use these) ----
export interface Sentence {
  englishSentence: string;
  spanishCloze: string;
  clozeAnswer: string;
}
const SENTENCES = sentencesData as Record<string, Sentence>;
export function sentenceFor(wordId: string): Sentence | undefined {
  return SENTENCES[wordId];
}
export function hasSentence(wordId: string): boolean {
  return !!SENTENCES[wordId];
}
