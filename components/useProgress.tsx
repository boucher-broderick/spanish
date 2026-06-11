"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyState, ExerciseId, ProgressState, Settings } from "@/lib/domain";
import { demoteWord, recordAttempt, resetExercise, resetWord } from "@/lib/progress";

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

  return { state, loading, saving, record, demote, updateSettings, doResetExercise, doResetWord };
}

export type ProgressApi = ReturnType<typeof useProgress>;
