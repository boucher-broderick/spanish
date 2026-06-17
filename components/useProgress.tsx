"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyState, ExerciseId, LessonPillar, ProgressState, Settings } from "@/lib/domain";
import { demoteWord, overrideExercise, recordAttempt, resetExercise, resetWord } from "@/lib/progress";
import {
  bumpDailyPillar,
  bumpLessonPillar,
  recordDailyWord,
  recordLessonPractice,
  syncLessonCompletion,
} from "@/lib/lesson-progress";
import { localToday as todayStr } from "@/lib/course";

// Loads progress from the server, applies optimistic local updates, and
// debounces saves back to /api/state.
export function useProgress() {
  const [state, setState] = useState<ProgressState>(emptyState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    let alive = true;
    fetch("/api/state")
      .then((r) => (r.ok ? r.json() : emptyState()))
      .then((data: ProgressState) => {
        if (!alive) return;
        // Merge defaults so older saved states gain new settings keys.
        setState({ ...emptyState(), ...data, settings: { ...emptyState().settings, ...data.settings } });
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      fetch("/api/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(latest.current),
      }).finally(() => setSaving(false));
    }, 600);
  }, []);

  const mutate = useCallback(
    (fn: (s: ProgressState) => ProgressState) => {
      setState((s) => {
        const next = fn(s);
        latest.current = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  const record = useCallback(
    (wordId: string, ex: ExerciseId, correct: boolean) => mutate((s) => recordAttempt(s, wordId, ex, correct)),
    [mutate]
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => mutate((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    [mutate]
  );

  const doResetExercise = useCallback(
    (ex: ExerciseId, wordId?: string) => mutate((s) => resetExercise(s, ex, wordId)),
    [mutate]
  );
  const doResetWord = useCallback((wordId: string) => mutate((s) => resetWord(s, wordId)), [mutate]);
  const demote = useCallback((wordId: string) => mutate((s) => demoteWord(s, wordId)), [mutate]);

  // ---- course mode ----
  // Count a passing composition attempt toward a lesson's gate (writing/reading/listening).
  const bumpLesson = useCallback(
    (lessonId: string, pillar: LessonPillar) => mutate((s) => bumpLessonPillar(s, lessonId, pillar, todayStr())),
    [mutate]
  );
  // Record a vocab attempt during a lesson, then stamp completion if the gate just cleared.
  const recordInLesson = useCallback(
    (wordId: string, ex: ExerciseId, correct: boolean, lessonId: string) =>
      mutate((s) => syncLessonCompletion(recordAttempt(s, wordId, ex, correct), lessonId, todayStr())),
    [mutate]
  );
  // Record a vocab attempt during daily review; a correct answer marks the word's clean pass.
  const recordInDaily = useCallback(
    (wordId: string, ex: ExerciseId, correct: boolean) =>
      mutate((s) => {
        const today = todayStr();
        const next = recordAttempt(s, wordId, ex, correct);
        return correct ? recordDailyWord(next, today, wordId) : next;
      }),
    [mutate]
  );
  const bumpDaily = useCallback(
    (pillar: LessonPillar) => mutate((s) => bumpDailyPillar(s, todayStr(), pillar)),
    [mutate]
  );
  // Count a completed generated-practice drill toward a grammar lesson's gate.
  const recordPractice = useCallback(
    (lessonId: string) => mutate((s) => recordLessonPractice(s, lessonId, todayStr())),
    [mutate]
  );
  // Manually mark a set of words mastered in an exercise (lesson override button).
  const overrideMastery = useCallback(
    (wordIds: string[], ex: ExerciseId, lessonId?: string) =>
      mutate((s) => {
        let n = s;
        for (const id of wordIds) n = overrideExercise(n, id, ex);
        return lessonId ? syncLessonCompletion(n, lessonId, todayStr()) : n;
      }),
    [mutate]
  );

  return {
    state,
    loading,
    saving,
    record,
    demote,
    updateSettings,
    doResetExercise,
    doResetWord,
    bumpLesson,
    recordInLesson,
    recordInDaily,
    bumpDaily,
    recordPractice,
    overrideMastery,
  };
}

export type ProgressApi = ReturnType<typeof useProgress>;
