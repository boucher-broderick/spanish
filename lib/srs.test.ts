import { describe, it, expect } from "vitest";
import {
  streakNeeded,
  firstEncounter,
  completeReview,
  gradeInSession,
  isComplete,
  type Progress,
} from "./srs";

describe("streakNeeded", () => {
  it("is 3 at stage 1, 2 at stages 2 & 4, 1 at stage 8+", () => {
    expect(streakNeeded(1)).toBe(3);
    expect(streakNeeded(2)).toBe(2);
    expect(streakNeeded(4)).toBe(2);
    expect(streakNeeded(8)).toBe(1);
    expect(streakNeeded(16)).toBe(1);
    expect(streakNeeded(128)).toBe(1);
  });
});

describe("firstEncounter (the three ratings)", () => {
  it("A — 'really know it' jumps to stage 8 and leaves the session", () => {
    const r = firstEncounter("really_know");
    expect(r.progress).toEqual({ stage: 8, wrongStreak: 0 });
    expect(r.drillThisSession).toBe(false);
    expect(r.intervalDays).toBe(8);
  });

  it("B — 'know it' jumps to stage 4 and leaves the session", () => {
    const r = firstEncounter("know");
    expect(r.progress).toEqual({ stage: 4, wrongStreak: 0 });
    expect(r.drillThisSession).toBe(false);
    expect(r.intervalDays).toBe(4);
  });

  it("C — 'don't know it' lands at stage 1, must drill 3-in-a-row this session", () => {
    const r = firstEncounter("dont_know");
    expect(r.progress).toEqual({ stage: 1, wrongStreak: 0 });
    expect(r.drillThisSession).toBe(true);
    expect(r.repsNeeded).toBe(3);
    expect(r.intervalDays).toBe(1);
  });
});

describe("completeReview — stage 1 always advances (never touches wrongStreak)", () => {
  it("advances 1 -> 2 whether the session was clean or had misses", () => {
    for (const erred of [false, true]) {
      const r = completeReview({ stage: 1, wrongStreak: 0 }, erred);
      expect(r.progress).toEqual({ stage: 2, wrongStreak: 0 });
      expect(r.intervalDays).toBe(2);
      expect(r.outcome).toBe("advance");
    }
  });
});

describe("completeReview — clean sessions", () => {
  it("advances one rung when wrongStreak is 0 (8 -> 16)", () => {
    const r = completeReview({ stage: 8, wrongStreak: 0 }, false);
    expect(r.progress).toEqual({ stage: 16, wrongStreak: 0 });
    expect(r.intervalDays).toBe(16);
    expect(r.outcome).toBe("advance");
  });

  it("clears a pending warning but HOLDS the stage when wrongStreak > 0", () => {
    const r = completeReview({ stage: 4, wrongStreak: 1 }, false);
    expect(r.progress).toEqual({ stage: 4, wrongStreak: 0 });
    expect(r.intervalDays).toBe(4);
    expect(r.outcome).toBe("clear-hold");
  });
});

describe("completeReview — example D (el agua at stage 8)", () => {
  it("first miss-session: hold at 8, wrongStreak 0 -> 1", () => {
    const r = completeReview({ stage: 8, wrongStreak: 0 }, true);
    expect(r.progress).toEqual({ stage: 8, wrongStreak: 1 });
    expect(r.intervalDays).toBe(8);
    expect(r.outcome).toBe("hold");
  });

  it("second miss-session: demote 8 -> 4, wrongStreak back to 1", () => {
    const r = completeReview({ stage: 8, wrongStreak: 1 }, true);
    expect(r.progress).toEqual({ stage: 4, wrongStreak: 1 });
    expect(r.intervalDays).toBe(4);
    expect(r.outcome).toBe("demote");
  });

  it("from {stage 4, wrong 1}: another miss demotes 4 -> 2, wrongStreak 1", () => {
    const r = completeReview({ stage: 4, wrongStreak: 1 }, true);
    expect(r.progress).toEqual({ stage: 2, wrongStreak: 1 });
    expect(r.intervalDays).toBe(2);
    expect(r.outcome).toBe("demote");
  });
});

describe("completeReview — demotion ladder floors at stage 1", () => {
  it("demotes one rung per repeated miss-session (each already at wrongStreak 1), flooring at 1", () => {
    expect(completeReview({ stage: 16, wrongStreak: 1 }, true).progress.stage).toBe(8);
    expect(completeReview({ stage: 8, wrongStreak: 1 }, true).progress.stage).toBe(4);
    expect(completeReview({ stage: 4, wrongStreak: 1 }, true).progress.stage).toBe(2);
    // demotion cannot go below stage 1
    expect(completeReview({ stage: 2, wrongStreak: 1 }, true).progress.stage).toBe(1);
  });

  it("a card demoted to stage 1 then advances back to 2 on its next completed session (stage 1 ignores wrongStreak)", () => {
    const r = completeReview({ stage: 1, wrongStreak: 1 }, true);
    expect(r.progress).toEqual({ stage: 2, wrongStreak: 0 });
    expect(r.outcome).toBe("advance");
  });
});

describe("in-session streak bookkeeping", () => {
  it("increments on correct, resets to 0 on a miss", () => {
    expect(gradeInSession(0, true)).toBe(1);
    expect(gradeInSession(2, true)).toBe(3);
    expect(gradeInSession(2, false)).toBe(0);
  });

  it("a 'don't know' word completes only after 3 in a row (with a reset mid-way)", () => {
    // example C drill: ✓ ✓ ✗(reset) ✓ ✓ ✓
    const stage = 1;
    let streak = 0;
    for (const correct of [true, true, false, true, true, true]) {
      streak = gradeInSession(streak, correct);
    }
    expect(streak).toBe(3);
    expect(isComplete(streak, stage)).toBe(true);
  });

  it("a stage-8 review completes after a single correct", () => {
    expect(isComplete(gradeInSession(0, true), 8)).toBe(true);
  });
});
