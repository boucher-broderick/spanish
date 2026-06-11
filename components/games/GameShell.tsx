"use client";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { accentOnlyMiss, matchesStrict } from "@/lib/text";
import { AccentBar } from "../AccentBar";
import { Phase } from "../exercises/shared";

export interface Question {
  prompt: ReactNode; // what's shown to the user
  accepted: string[]; // every Spanish answer accepted as correct
  canonical: string; // the form to reveal when wrong
}

// Outer layout for a standalone game: exit + title + live score, with the
// accent bar pinned at the bottom.
export function GameShell({
  title,
  onExit,
  score,
  controls,
  children,
}: {
  title: string;
  onExit: () => void;
  score: { correct: number; total: number };
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button onClick={onExit} className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Exit
        </button>
        <div className="truncate text-sm font-semibold text-slate-700">{title}</div>
        <div className="min-w-16 text-right text-xs font-semibold text-slate-500">
          {score.correct}/{score.total}
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-3 py-4">
        {controls}
        {children}
      </main>
      <AccentBar />
    </div>
  );
}

// Generic typed-answer round: prompt → check (accent-sensitive, multiple accepted
// forms) → feedback → next. Endless, with a running live score. `genKey` forces a
// fresh question when game settings change.
export function useTypedGame(gen: () => Question, genKey: string | number = 0) {
  const [q, setQ] = useState<Question>(gen);
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const genRef = useRef(gen);
  genRef.current = gen;
  const firstRun = useRef(true);

  const next = useCallback(() => {
    setQ(genRef.current());
    setValue("");
    setPhase("input");
    inputRef.current?.focus();
  }, []);

  // Regenerate when settings change (skip the initial render — useState already
  // produced the first question).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      inputRef.current?.focus();
      return;
    }
    next();
  }, [genKey, next]);

  const correct = q.accepted.some((a) => matchesStrict(value, a));
  const accentMiss = !correct && q.accepted.some((a) => accentOnlyMiss(value, a));

  function submit() {
    if (!value.trim() || phase === "feedback") return;
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    setPhase("feedback");
  }
  function onEnter() {
    if (phase === "input") submit();
    else next();
  }

  return { q, value, setValue, phase, correct, accentMiss, score, submit, next, onEnter, inputRef };
}
