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
  recordLessonPractice,
} from "./lesson-progress";

const TODAY = "2026-06-15";
const LESSON = "u2-ser-vs-estar"; // grammar lesson (needs practice)
const VOCAB_LESSON = "u2-adjectives"; // vocab chapter (no practice requirement)
const LESSON_WORD_COUNT = resolveLessonWords(getLesson(LESSON)!).length;

// Mark every word of a lesson as mastered in its gate exercise.
function masterWords(state: ProgressState, lessonId: string): ProgressState {
  const lesson = getLesson(lessonId)!;
  const words = { ...state.words };
  for (const w of resolveLessonWords(lesson)) {
    words[w.id] = {
      review: true,
      stats: { [gateExerciseForPos(w.pos)]: { attempts: 3, correct: 3, streak: 3 } },
    };
  }
  return { ...state, words };
}

// Bump all three composition pillars past their target.
function maxPillars(state: ProgressState, lessonId: string): ProgressState {
  let s = state;
  for (const pillar of ["writing", "reading", "listening"] as const) {
    for (let i = 0; i < 3; i++) s = bumpLessonPillar(s, lessonId, pillar, TODAY);
  }
  return s;
}

describe("lesson gate", () => {
  it("a fresh lesson is not passed", () => {
    const g = lessonGate(emptyState(), getLesson(LESSON)!);
    expect(g.passed).toBe(false);
    expect(g.writing.done).toBe(0);
    expect(g.writing.target).toBe(1);
    expect(g.vocab.total).toBe(LESSON_WORD_COUNT);
    expect(g.practice).toEqual({ done: 0, target: 2 }); // grammar lesson
  });

  it("a grammar lesson needs the 5x practice drills on top of pillars + vocab", () => {
    let s = emptyState();
    s = maxPillars(s, LESSON);
    s = masterWords(s, LESSON);
    // pillars + vocab done, but practice not yet → still locked
    expect(lessonGate(s, getLesson(LESSON)!).passed).toBe(false);
    for (let i = 0; i < 2; i++) s = recordLessonPractice(s, LESSON, TODAY);
    expect(lessonGate(s, getLesson(LESSON)!).passed).toBe(true);
    expect(s.lessons?.[LESSON]?.completedAt).toBe(TODAY); // stamped on the final practice
  });

  it("a vocab chapter ignores the practice requirement", () => {
    let s = emptyState();
    const g0 = lessonGate(s, getLesson(VOCAB_LESSON)!);
    expect(g0.practice).toBeUndefined();
    s = maxPillars(s, VOCAB_LESSON);
    s = masterWords(s, VOCAB_LESSON);
    expect(lessonGate(s, getLesson(VOCAB_LESSON)!).passed).toBe(true);
  });

  it("caps pillar counters at the target", () => {
    let s = emptyState();
    for (let i = 0; i < 25; i++) s = bumpLessonPillar(s, LESSON, "reading", TODAY);
    expect(s.lessons?.[LESSON]?.readingDone).toBe(1);
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
    expect(pool.length).toBe(LESSON_WORD_COUNT);
    expect(canAdvance(s, TODAY)).toBe(false);

    for (const id of pool) s = recordDailyWord(s, TODAY, id);
    expect(dailyStatus(s, TODAY).wordsDone).toBe(LESSON_WORD_COUNT);
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
    expect(dailyStatus(s, TODAY).wordsDone).toBe(LESSON_WORD_COUNT);
    // a new day: yesterday's progress no longer counts
    const tomorrow = "2026-06-16";
    expect(dailyStatus(s, tomorrow).wordsDone).toBe(0);
    expect(dailyStatus(s, tomorrow).writingDone).toBe(false);
    expect(canAdvance(s, tomorrow)).toBe(false);
  });
});
