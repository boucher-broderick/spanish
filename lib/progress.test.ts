import { describe, it, expect } from "vitest";
import { emptyState, MIN_STREAK, ProgressState, Word } from "./domain";
import {
  demoteWord,
  exercisePassed,
  isReview,
  isUnderstood,
  recordAttempt,
  resetExercise,
  selectLearnRound,
} from "./progress";

function mkWord(id: string, rank: number): Word {
  return {
    id,
    rank,
    categoryRank: rank,
    category: "Verbs",
    pos: "verb",
    spanish: id,
    english: id,
    lemma: id,
    article: null,
    gender: null,
    verbGroup: "ar",
  };
}

// Record n attempts of which c are correct.
function many(state: ProgressState, id: string, ex: Parameters<typeof recordAttempt>[2], n: number, c: number) {
  let s = state;
  for (let i = 0; i < n; i++) s = recordAttempt(s, id, ex, i < c);
  return s;
}

describe("the MIN_STREAK-in-a-row single-game rule", () => {
  it("passes only after MIN_STREAK correct in a row", () => {
    let s = many(emptyState(), "w", "spelling", MIN_STREAK - 1, MIN_STREAK - 1); // 2 in a row
    expect(exercisePassed(s, "w", "spelling")).toBe(false);
    s = recordAttempt(s, "w", "spelling", true); // the MIN_STREAK-th in a row
    expect(exercisePassed(s, "w", "spelling")).toBe(true);
  });

  it("a wrong answer resets the streak", () => {
    let s = many(emptyState(), "w", "spelling", MIN_STREAK - 1, MIN_STREAK - 1); // 2 in a row
    s = recordAttempt(s, "w", "spelling", false); // miss resets
    s = many(s, "w", "spelling", MIN_STREAK - 1, MIN_STREAK - 1); // only 2 in a row again
    expect(exercisePassed(s, "w", "spelling")).toBe(false);
    s = recordAttempt(s, "w", "spelling", true); // now MIN_STREAK in a row
    expect(exercisePassed(s, "w", "spelling")).toBe(true);
  });

  it("graduates to review on the MIN_STREAK-th in a row", () => {
    let s = many(emptyState(), "w", "spelling", MIN_STREAK - 1, MIN_STREAK - 1);
    expect(isUnderstood(s, "w")).toBe(false);
    expect(isReview(s, "w")).toBe(false);
    s = recordAttempt(s, "w", "spelling", true); // crosses the bar
    expect(isUnderstood(s, "w")).toBe(true);
    expect(isReview(s, "w")).toBe(true); // recordAttempt auto-flags
  });

  it("graduates a verb via conjugation too", () => {
    const s = many(emptyState(), "v", "conjugation", MIN_STREAK, MIN_STREAK);
    expect(isReview(s, "v")).toBe(true);
  });
});

describe("review demotion", () => {
  it("removes review status and resets the main-game stat", () => {
    let s = many(emptyState(), "w", "spelling", 10, 10);
    expect(isReview(s, "w")).toBe(true);
    s = demoteWord(s, "w");
    expect(isReview(s, "w")).toBe(false);
    expect(exercisePassed(s, "w", "spelling")).toBe(false);
    expect(isUnderstood(s, "w")).toBe(false);
  });
});

describe("selection", () => {
  const pool = [mkWord("a", 1), mkWord("b", 2), mkWord("c", 3)];
  it("excludes the word that already passed this game", () => {
    const s = many(emptyState(), "a", "spelling", 10, 10);
    const round = selectLearnRound(s, pool, "spelling");
    expect(round.map((w) => w.id)).toEqual(["b", "c"]);
  });
  it("excludes review words", () => {
    const s = many(emptyState(), "b", "spelling", 10, 10); // b -> mastered/review
    const round = selectLearnRound(s, pool, "spelling");
    expect(round.map((w) => w.id)).toEqual(["a", "c"]);
  });
  it("serves least-practised first within the set", () => {
    let s = emptyState();
    s = many(s, "a", "spelling", 2, 2); // a practised but not yet mastered (needs MIN_CORRECT)
    const round = selectLearnRound(s, pool, "spelling");
    expect(round[round.length - 1].id).toBe("a");
  });
});

describe("resetExercise", () => {
  it("clears stats and drops the word back out of review", () => {
    let s = many(emptyState(), "w", "spelling", 10, 10);
    expect(isReview(s, "w")).toBe(true);
    s = resetExercise(s, "spelling", "w");
    expect(exercisePassed(s, "w", "spelling")).toBe(false);
    expect(isReview(s, "w")).toBe(false);
  });
});
