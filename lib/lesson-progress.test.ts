import { describe, it, expect } from "vitest";
import { emptyState, type ProgressState } from "./domain";
import { getLesson, resolveLessonWords, gateExerciseForPos } from "./curriculum";
import {
  bumpLessonPillar,
  bumpDailyPillar,
  canAdvance,
  dailyReviewDone,
  dailyStatus,
  dailyWordPool,
  lessonGate,
  recordDailyWord,
} from "./lesson-progress";

const TODAY = "2026-06-15";
const LESSON = "u2-ser-vs-estar";

// Mark every word of a lesson as mastered in its gate exercise.
function masterWords(state: ProgressState, lessonId: string): ProgressState {
  const lesson = getLesson(lessonId)!;
  const words = { ...state.words };
  for (const w of resolveLessonWords(lesson)) {
    words[w.id] = { review: false, stats: { [gateExerciseForPos(w.pos)]: { attempts: 10, correct: 10 } } };
  }
  return { ...state, words };
}

// Bump all three composition pillars to their target.
function maxPillars(state: ProgressState, lessonId: string): ProgressState {
  let s = state;
  for (const pillar of ["writing", "reading", "listening"] as const) {
    for (let i = 0; i < 10; i++) s = bumpLessonPillar(s, lessonId, pillar, TODAY);
  }
  return s;
}

describe("lesson gate", () => {
  it("a fresh lesson is not passed", () => {
    const g = lessonGate(emptyState(), getLesson(LESSON)!);
    expect(g.passed).toBe(false);
    expect(g.writing.done).toBe(0);
    expect(g.vocab.total).toBe(4);
  });

  it("passes only when all four pillars clear, and stamps completedAt", () => {
    let s = emptyState();
    s = maxPillars(s, LESSON); // pillars done, vocab not
    expect(lessonGate(s, getLesson(LESSON)!).passed).toBe(false);
    s = masterWords(s, LESSON); // now vocab too — but completion is stamped on a bump
    expect(lessonGate(s, getLesson(LESSON)!).passed).toBe(true);
    expect(s.lessons?.[LESSON]?.completedAt).toBeUndefined();
    // a further bump (capped) triggers the completedAt stamp
    s = bumpLessonPillar(s, LESSON, "writing", TODAY);
    expect(s.lessons?.[LESSON]?.completedAt).toBe(TODAY);
  });

  it("caps pillar counters at the target", () => {
    let s = emptyState();
    for (let i = 0; i < 25; i++) s = bumpLessonPillar(s, LESSON, "reading", TODAY);
    expect(s.lessons?.[LESSON]?.readingDone).toBe(10);
  });
});

describe("daily review", () => {
  it("is trivially done and advancing is allowed before any lesson is completed", () => {
    const s = emptyState();
    expect(dailyReviewDone(s, TODAY)).toBe(true);
    expect(canAdvance(s, TODAY)).toBe(true);
    expect(dailyWordPool(s)).toHaveLength(0);
  });

  it("blocks advancing until the window words + 1/1/1 are done", () => {
    let s = emptyState();
    s = { ...s, lessons: { [LESSON]: { writingDone: 10, readingDone: 10, listeningDone: 10, completedAt: "2026-06-14" } } };
    const pool = dailyWordPool(s);
    expect(pool.length).toBe(4);
    expect(canAdvance(s, TODAY)).toBe(false);

    for (const id of pool) s = recordDailyWord(s, TODAY, id);
    expect(dailyStatus(s, TODAY).wordsDone).toBe(4);
    expect(canAdvance(s, TODAY)).toBe(false); // composition still pending

    s = bumpDailyPillar(s, TODAY, "writing");
    s = bumpDailyPillar(s, TODAY, "reading");
    s = bumpDailyPillar(s, TODAY, "listening");
    expect(dailyReviewDone(s, TODAY)).toBe(true);
    expect(canAdvance(s, TODAY)).toBe(true);
  });

  it("resets when the calendar day changes", () => {
    let s = emptyState();
    s = { ...s, lessons: { [LESSON]: { writingDone: 10, readingDone: 10, listeningDone: 10, completedAt: "2026-06-14" } } };
    for (const id of dailyWordPool(s)) s = recordDailyWord(s, TODAY, id);
    s = bumpDailyPillar(s, TODAY, "writing");
    expect(dailyStatus(s, TODAY).wordsDone).toBe(4);
    // a new day: yesterday's progress no longer counts
    const tomorrow = "2026-06-16";
    expect(dailyStatus(s, tomorrow).wordsDone).toBe(0);
    expect(dailyStatus(s, tomorrow).writingDone).toBe(false);
    expect(canAdvance(s, tomorrow)).toBe(false);
  });
});
