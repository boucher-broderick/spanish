// Pure progress logic: stat math, the 10/80 single-game mastery rule, word selection.
import {
  COUNTING_EXERCISES,
  ExerciseId,
  MIN_STREAK,
  ProgressState,
  ROUND_SIZE,
  SET_SIZE,
  Stat,
  Word,
  WordProgress,
} from "./domain";

// The scoring games that can drive mastery. In the new app each group records
// only ITS main game (Nouns/Other → spelling, Verbs → conjugation), so a word
// only ever accumulates stats in one of these — checking both is safe and means
// these helpers don't need to know a word's group.
const MASTERY_GAMES: ExerciseId[] = ["spelling", "conjugation"];

export function emptyWordProgress(): WordProgress {
  return { review: false, stats: {} };
}

export function getStat(state: ProgressState, wordId: string, ex: ExerciseId): Stat {
  return state.words[wordId]?.stats[ex] ?? { attempts: 0, correct: 0, streak: 0 };
}

export function accuracy(stat: Stat): number {
  return stat.attempts > 0 ? stat.correct / stat.attempts : 0;
}

// Has this word been answered correctly MIN_STREAK times IN A ROW in this exercise?
export function exercisePassed(state: ProgressState, wordId: string, ex: ExerciseId): boolean {
  return (getStat(state, wordId, ex).streak ?? 0) >= MIN_STREAK;
}

// Mastered = passed the bar (>=10 attempts AND >=80%) in the group's main game.
// Since only the main game is ever recorded for a word, checking both is correct.
export function isUnderstood(state: ProgressState, wordId: string): boolean {
  return MASTERY_GAMES.some((ex) => exercisePassed(state, wordId, ex));
}

export function isReview(state: ProgressState, wordId: string): boolean {
  return state.words[wordId]?.review ?? false;
}

// Immutably record one attempt; flag the word as review if it just crossed mastery.
export function recordAttempt(
  state: ProgressState,
  wordId: string,
  ex: ExerciseId,
  correct: boolean
): ProgressState {
  const prev = state.words[wordId] ?? emptyWordProgress();
  const prevStat = prev.stats[ex] ?? { attempts: 0, correct: 0, streak: 0 };
  const stat: Stat = {
    attempts: prevStat.attempts + 1,
    correct: prevStat.correct + (correct ? 1 : 0),
    streak: correct ? (prevStat.streak ?? 0) + 1 : 0,
  };
  const nextWord: WordProgress = { ...prev, stats: { ...prev.stats, [ex]: stat } };
  const next: ProgressState = { ...state, words: { ...state.words, [wordId]: nextWord } };
  // Flag (but keep stats; no demotion) once mastery is reached.
  if (!nextWord.review && isUnderstood(next, wordId)) {
    next.words[wordId] = { ...nextWord, review: true };
  }
  return next;
}

// Manual override: mark a word as mastered in an exercise without grinding the
// reps (sets correct to the bar and flags review). Used by the lesson override button.
export function overrideExercise(state: ProgressState, wordId: string, ex: ExerciseId): ProgressState {
  const prev = state.words[wordId] ?? emptyWordProgress();
  const prevStat = prev.stats[ex] ?? { attempts: 0, correct: 0, streak: 0 };
  const stat: Stat = {
    attempts: Math.max(prevStat.attempts, MIN_STREAK),
    correct: Math.max(prevStat.correct, MIN_STREAK),
    streak: Math.max(prevStat.streak ?? 0, MIN_STREAK),
  };
  const nextWord: WordProgress = { ...prev, stats: { ...prev.stats, [ex]: stat }, review: true };
  return { ...state, words: { ...state.words, [wordId]: nextWord } };
}

// Reset tracking for a given exercise (one word, or all words when wordId omitted).
export function resetExercise(
  state: ProgressState,
  ex: ExerciseId,
  wordId?: string
): ProgressState {
  const words = { ...state.words };
  const apply = (id: string) => {
    const wp = words[id];
    if (!wp || !wp.stats[ex]) return;
    const stats = { ...wp.stats };
    delete stats[ex];
    // Clearing an exercise may drop the word back below mastery — recompute review.
    const candidate: ProgressState = { ...state, words: { ...words, [id]: { ...wp, stats } } };
    const review = isUnderstood(candidate, id);
    words[id] = { ...wp, stats, review };
  };
  if (wordId) apply(wordId);
  else Object.keys(words).forEach(apply);
  return { ...state, words };
}

// Clear ALL tracking for one word (across every exercise) and unflag review.
export function resetWord(state: ProgressState, wordId: string): ProgressState {
  const words = { ...state.words };
  delete words[wordId];
  return { ...state, words };
}

// Review demotion: a known word answered wrong loses review status AND its
// main-game stats, so it drops back into the Learn set to be relearned.
export function demoteWord(state: ProgressState, wordId: string): ProgressState {
  const wp = state.words[wordId];
  if (!wp) return state;
  const stats = { ...wp.stats };
  for (const ex of MASTERY_GAMES) delete stats[ex];
  return { ...state, words: { ...state.words, [wordId]: { review: false, stats } } };
}

// ---- selection ----

// Learn mode: the active set is the top SET_SIZE (20) eligible words by rank
// (eligible = not in review, and for counting exercises not yet past the bar).
// A round serves ROUND_SIZE (10) of them, prioritising the least-practised so the
// whole set gets covered over successive rounds. As words graduate, the next word
// by rank backfills the set.
export function selectLearnRound(
  state: ProgressState,
  pool: Word[],
  ex: ExerciseId
): Word[] {
  const counts = COUNTING_EXERCISES.includes(ex);
  const set = pool
    .filter((w) => {
      if (isReview(state, w.id)) return false;
      if (counts && exercisePassed(state, w.id, ex)) return false;
      return true;
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, SET_SIZE);
  // Stable sort by fewest attempts so the least-seen words come first this round.
  return [...set]
    .sort((a, b) => getStat(state, a.id, ex).attempts - getStat(state, b.id, ex).attempts)
    .slice(0, ROUND_SIZE);
}

// All review words (optionally restricted to a category), for Review mode.
export function reviewPool(state: ProgressState, pool: Word[]): Word[] {
  return pool.filter((w) => isReview(state, w.id));
}

// Deterministic shuffle (seeded) so SSR/CSR agree and rounds are reproducible if needed.
export function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
