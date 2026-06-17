// Pure logic for Course-mode progress: the per-lesson gate (writing/reading/
// listening pillars + vocab mastery) and the daily-review window. Kept separate
// from lib/progress.ts (pure stat math, no content deps) because these helpers
// reference curriculum content. Dependency is one-way: lesson-progress -> progress.
//
// "today" is always passed in (never `new Date()` here) so the module stays pure
// and unit-testable; the client hook supplies the real calendar day.
import type { LessonPillar, LessonProgress, ProgressState, Word } from "./domain";
import {
  COMPOSITION_PASS_SCORE,
  DAILY_WINDOW,
  LESSON_LISTENING_TARGET,
  LESSON_PRACTICE_TARGET,
  LESSON_READING_TARGET,
  LESSON_WRITING_TARGET,
  type Lesson,
  type LessonGateSummary,
  type ResolvedWord,
} from "./course";
import { getLesson, lessonPlayPool, orderedLessons, resolveLessonWords, gateExerciseForPos } from "./curriculum";
import { exercisePassed, isReview } from "./progress";

export { COMPOSITION_PASS_SCORE };

// ---------------- per-lesson gate ----------------

export function emptyLessonProgress(): LessonProgress {
  return { writingDone: 0, readingDone: 0, listeningDone: 0 };
}

export function getLessonProgress(state: ProgressState, lessonId: string): LessonProgress {
  return state.lessons?.[lessonId] ?? emptyLessonProgress();
}

const PILLAR_TARGET: Record<LessonPillar, number> = {
  writing: LESSON_WRITING_TARGET,
  reading: LESSON_READING_TARGET,
  listening: LESSON_LISTENING_TARGET,
};
const PILLAR_FIELD: Record<LessonPillar, keyof LessonProgress> = {
  writing: "writingDone",
  reading: "readingDone",
  listening: "listeningDone",
};

// Vocab portion of the gate: how many of the lesson's words are mastered in their
// gate exercise (verbs -> conjugation, else -> spelling).
export function lessonVocabProgress(
  state: ProgressState,
  lesson: Lesson
): { done: number; total: number } {
  const words = resolveLessonWords(lesson);
  let done = 0;
  for (const w of words) {
    // Sticky: a word stays mastered once it hits the streak (review flag) even if a
    // later answer breaks the live streak.
    if (isReview(state, w.id) || exercisePassed(state, w.id, gateExerciseForPos(w.pos))) done++;
  }
  return { done, total: words.length };
}

// Single source of truth for the lesson gate UI + completion check. Grammar
// lessons add a 5x generated-practice requirement; vocab chapters skip it.
export function lessonGate(state: ProgressState, lesson: Lesson): LessonGateSummary {
  const lp = getLessonProgress(state, lesson.id);
  const vocab = lessonVocabProgress(state, lesson);
  const writing = { done: lp.writingDone, target: LESSON_WRITING_TARGET };
  const reading = { done: lp.readingDone, target: LESSON_READING_TARGET };
  const listening = { done: lp.listeningDone, target: LESSON_LISTENING_TARGET };
  const practice =
    lesson.kind === "grammar"
      ? { done: lp.practiceDone ?? 0, target: LESSON_PRACTICE_TARGET }
      : undefined;
  const passed =
    writing.done >= writing.target &&
    reading.done >= reading.target &&
    listening.done >= listening.target &&
    vocab.done >= vocab.total &&
    (!practice || practice.done >= practice.target);
  return { writing, reading, listening, vocab, practice, passed };
}

// Immutably bump a pillar counter (capped at its target). Marks completedAt the
// moment all four gate conditions hold.
export function bumpLessonPillar(
  state: ProgressState,
  lessonId: string,
  pillar: LessonPillar,
  today: string
): ProgressState {
  const prev = getLessonProgress(state, lessonId);
  const field = PILLAR_FIELD[pillar];
  const next: LessonProgress = {
    ...prev,
    [field]: Math.min((prev[field] as number) + 1, PILLAR_TARGET[pillar]),
  };
  const lessons = { ...(state.lessons ?? {}), [lessonId]: next };
  const out: ProgressState = { ...state, lessons };
  const lesson = getLesson(lessonId);
  if (lesson && !next.completedAt && lessonGate(out, lesson).passed) {
    lessons[lessonId] = { ...next, completedAt: today };
  }
  return out;
}

// Count one completed generated-practice drill toward the grammar-lesson gate
// (capped at the target), stamping completedAt if it was the last thing to clear.
export function recordLessonPractice(state: ProgressState, lessonId: string, today: string): ProgressState {
  const prev = getLessonProgress(state, lessonId);
  const next: LessonProgress = {
    ...prev,
    practiceDone: Math.min((prev.practiceDone ?? 0) + 1, LESSON_PRACTICE_TARGET),
  };
  const out: ProgressState = { ...state, lessons: { ...(state.lessons ?? {}), [lessonId]: next } };
  return syncLessonCompletion(out, lessonId, today);
}

// True once every gate condition holds (used to flip completedAt when the vocab
// portion is the last thing to clear — call after recording vocab attempts too).
export function syncLessonCompletion(
  state: ProgressState,
  lessonId: string,
  today: string
): ProgressState {
  const lesson = getLesson(lessonId);
  if (!lesson) return state;
  const lp = getLessonProgress(state, lessonId);
  if (lp.completedAt) return state;
  if (!lessonGate(state, lesson).passed) return state;
  const lessons = { ...(state.lessons ?? {}), [lessonId]: { ...lp, completedAt: today } };
  return { ...state, lessons };
}

export function isLessonComplete(state: ProgressState, lessonId: string): boolean {
  return !!state.lessons?.[lessonId]?.completedAt;
}

// ---------------- engaged-course-word pools (for "other practice") ----------------

// A lesson is "engaged" once the user has touched it: completed, any gate counter
// moved, or any of its words attempted. Drives what "other practice" reviews.
export function isLessonEngaged(state: ProgressState, lesson: Lesson): boolean {
  const lp = state.lessons?.[lesson.id];
  if (lp && (lp.completedAt || lp.writingDone || lp.readingDone || lp.listeningDone || (lp.practiceDone ?? 0))) {
    return true;
  }
  return resolveLessonWords(lesson).some((w) => {
    const wp = state.words[w.id];
    return wp ? Object.values(wp.stats).some((s) => (s?.attempts ?? 0) > 0) : false;
  });
}

// All words from engaged lessons (deduped) — the course vocabulary the user has met.
export function engagedCourseWords(state: ProgressState): ResolvedWord[] {
  const seen = new Set<string>();
  const out: ResolvedWord[] = [];
  for (const lesson of orderedLessons()) {
    if (!isLessonEngaged(state, lesson)) continue;
    for (const w of resolveLessonWords(lesson)) {
      if (!seen.has(w.id)) {
        seen.add(w.id);
        out.push(w);
      }
    }
  }
  return out;
}

// Playable words from engaged lessons for a given exercise — the "other practice"
// spelling/conjugation review pool.
export function courseReviewPool(state: ProgressState, exercise: "conjugation" | "spelling") {
  const seen = new Set<string>();
  const out = [];
  for (const lesson of orderedLessons()) {
    if (!isLessonEngaged(state, lesson)) continue;
    for (const w of lessonPlayPool(lesson, exercise)) {
      if (!seen.has(w.id)) {
        seen.add(w.id);
        out.push(w);
      }
    }
  }
  return out;
}

// ---------------- daily review ----------------

function emptyDaily(date: string) {
  return { date, wordsDone: [] as string[], writingDone: false, readingDone: false, listeningDone: false };
}

// The user's daily-review state for `today`, resetting it when the stored day is
// stale (or absent). Pure — returns a fresh object, never mutates.
export function currentDaily(state: ProgressState, today: string) {
  const d = state.daily;
  return d && d.date === today ? d : emptyDaily(today);
}

// The <=DAILY_WINDOW most-recently-completed lessons (newest first).
export function dailyWindowLessons(state: ProgressState): Lesson[] {
  const completed = orderedLessons()
    .map((l) => ({ l, at: state.lessons?.[l.id]?.completedAt }))
    .filter((x): x is { l: Lesson; at: string } => !!x.at);
  completed.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return completed.slice(0, DAILY_WINDOW).map((x) => x.l);
}

// Deduped word ids from the window lessons — the pool that needs a clean pass today.
export function dailyWordPool(state: ProgressState): string[] {
  const ids = new Set<string>();
  for (const lesson of dailyWindowLessons(state)) {
    for (const w of resolveLessonWords(lesson)) ids.add(w.id);
  }
  return [...ids];
}

// Playable words for the daily review, aggregated across the window lessons for a
// given exercise (verbs -> conjugation, the rest -> spelling), deduped by id.
export function dailyPlayPool(state: ProgressState, exercise: "conjugation" | "spelling"): Word[] {
  const seen = new Set<string>();
  const out: Word[] = [];
  for (const lesson of dailyWindowLessons(state)) {
    for (const w of lessonPlayPool(lesson, exercise)) {
      if (!seen.has(w.id)) {
        seen.add(w.id);
        out.push(w);
      }
    }
  }
  return out;
}

// Mark a word's clean pass for today (resetting the day if stale).
export function recordDailyWord(state: ProgressState, today: string, wordId: string): ProgressState {
  const d = currentDaily(state, today);
  if (d.wordsDone.includes(wordId)) {
    return state.daily?.date === today ? state : { ...state, daily: d };
  }
  return { ...state, daily: { ...d, wordsDone: [...d.wordsDone, wordId] } };
}

export function bumpDailyPillar(state: ProgressState, today: string, pillar: LessonPillar): ProgressState {
  const d = currentDaily(state, today);
  const field = PILLAR_FIELD[pillar];
  // LessonProgress and DailyReview share field names but daily uses booleans.
  const key = field === "writingDone" ? "writingDone" : field === "readingDone" ? "readingDone" : "listeningDone";
  return { ...state, daily: { ...d, [key]: true } };
}

export interface DailyStatus {
  date: string;
  pool: string[];
  wordsDone: number;
  wordsTotal: number;
  writingDone: boolean;
  readingDone: boolean;
  listeningDone: boolean;
  done: boolean;
}

export function dailyStatus(state: ProgressState, today: string): DailyStatus {
  const d = currentDaily(state, today);
  const pool = dailyWordPool(state);
  const wordsDone = pool.filter((id) => d.wordsDone.includes(id)).length;
  const composition = d.writingDone && d.readingDone && d.listeningDone;
  // No completed lessons yet -> nothing to review -> trivially done.
  const done = pool.length === 0 ? true : wordsDone >= pool.length && composition;
  return {
    date: today,
    pool,
    wordsDone,
    wordsTotal: pool.length,
    writingDone: d.writingDone,
    readingDone: d.readingDone,
    listeningDone: d.listeningDone,
    done,
  };
}

export function dailyReviewDone(state: ProgressState, today: string): boolean {
  return dailyStatus(state, today).done;
}

// Gate for advancing to a not-yet-started lesson: allowed when nothing is completed
// yet (first lesson) OR today's review is done. Re-opening in-progress/completed
// lessons is always allowed — only advancing is gated.
export function canAdvance(state: ProgressState, today: string): boolean {
  const anyCompleted = !!state.lessons && Object.values(state.lessons).some((l) => l.completedAt);
  if (!anyCompleted) return true;
  return dailyReviewDone(state, today);
}
