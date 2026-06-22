// The spaced-repetition engine — pure, framework-free, side-effect-free (no
// dates, no I/O) so it's exhaustively unit-testable. The session/route layer
// wires this to the DB (srs_progress) and supplies "today" for due-date math.
//
// Model (see plans/learning-system.md §4):
//  - stage: rung on the doubling ladder 1,2,4,8,16,… (interval in days). 0 = new/unseen.
//  - streak: correct answers in a row THIS SESSION (resets to 0 on a miss).
//  - wrongStreak: count of review sessions with ≥1 miss; lives in {0,1,2}. ONLY
//    ever changes at stage ≥ 2.
//  - streakNeeded(stage): reps in a row to "complete" a card — stage 1→3, 2&4→2, 8+→1.

export type Rating = "dont_know" | "know" | "really_know";

/** Persistent per-card state (what we store in srs_progress). */
export interface Progress {
  stage: number; // 0 = never seen; otherwise a ladder rung (1,2,4,8,…)
  wrongStreak: number; // 0..2
}

export const NEW_PROGRESS: Progress = { stage: 0, wrongStreak: 0 };

/** Reps-in-a-row required to complete a card at a given stage. */
export function streakNeeded(stage: number): 1 | 2 | 3 {
  if (stage <= 1) return 3;
  if (stage <= 4) return 2; // stages 2 and 4
  return 1; // stage 8 and beyond
}

const advance = (stage: number) => (stage <= 0 ? 1 : stage * 2);
const demote = (stage: number) => Math.max(1, Math.floor(stage / 2));

/** What a first encounter (or first-sight miss) does to a brand-new card. */
export interface FirstResult {
  progress: Progress;
  /** Only "dont_know" must be drilled in the current session (to 3-in-a-row). */
  drillThisSession: boolean;
  repsNeeded: number; // in-a-row required before it leaves the session
  intervalDays: number; // days until next_due once it leaves
}

/**
 * First encounter. A new card must be answered correctly first; a first-sight
 * MISS counts as "dont_know" (pass rating="dont_know"). "know"/"really_know"
 * upgrade immediately and leave the session; "dont_know" stays at stage 1 and
 * must earn 3-in-a-row now.
 */
export function firstEncounter(rating: Rating): FirstResult {
  switch (rating) {
    case "really_know":
      return { progress: { stage: 8, wrongStreak: 0 }, drillThisSession: false, repsNeeded: 0, intervalDays: 8 };
    case "know":
      return { progress: { stage: 4, wrongStreak: 0 }, drillThisSession: false, repsNeeded: 0, intervalDays: 4 };
    case "dont_know":
      return { progress: { stage: 1, wrongStreak: 0 }, drillThisSession: true, repsNeeded: 3, intervalDays: 1 };
  }
}

export type ReviewOutcome = "advance" | "hold" | "demote" | "clear-hold";

export interface ReviewResult {
  progress: Progress;
  intervalDays: number; // days until next_due
  outcome: ReviewOutcome;
}

/**
 * Apply the session-completion transition for a card already in review (stage ≥ 1),
 * given whether the learner erred at least once during the session (it is assumed
 * the card was eventually completed, i.e. reached its streakNeeded).
 *
 *  - stage 1 never engages wrongStreak → always advances to stage 2.
 *  - erred: wrongStreak += 1; ==1 holds at stage, ==2 demotes one rung & resets to 1.
 *  - clean: wrongStreak==0 advances one rung; wrongStreak>0 clears to 0 and holds.
 */
export function completeReview(p: Progress, erred: boolean): ReviewResult {
  const { stage, wrongStreak } = p;

  if (stage <= 1) {
    const ns = advance(stage); // 1 -> 2 (0 -> 1 guarded, but reviews start at >=1)
    return { progress: { stage: ns, wrongStreak: 0 }, intervalDays: ns, outcome: "advance" };
  }

  if (erred) {
    const w = wrongStreak + 1;
    if (w >= 2) {
      const ns = demote(stage);
      return { progress: { stage: ns, wrongStreak: 1 }, intervalDays: ns, outcome: "demote" };
    }
    return { progress: { stage, wrongStreak: 1 }, intervalDays: stage, outcome: "hold" };
  }

  if (wrongStreak === 0) {
    const ns = advance(stage);
    return { progress: { stage: ns, wrongStreak: 0 }, intervalDays: ns, outcome: "advance" };
  }
  return { progress: { stage, wrongStreak: 0 }, intervalDays: stage, outcome: "clear-hold" };
}

// ---- in-session streak bookkeeping ----

/** New in-a-row count after an answer. A miss resets to 0. */
export function gradeInSession(streak: number, correct: boolean): number {
  return correct ? streak + 1 : 0;
}

/** Has the card met its rep requirement and earned the right to leave the session? */
export function isComplete(streak: number, stage: number): boolean {
  return streak >= streakNeeded(stage);
}
