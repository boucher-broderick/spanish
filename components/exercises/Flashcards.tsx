"use client";
import { useState } from "react";
import { Word } from "@/lib/domain";
import { Button } from "../ui";

// Flashcards: flip to reveal. No scoring — purely for learning.
export function Flashcards({
  word,
  front,
  onNext,
}: {
  word: Word;
  front: "es" | "en";
  onNext: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  const spanish = word.spanish;
  const english = word.english;
  const top = front === "es" ? spanish : english;
  const bottom = front === "es" ? english : spanish;

  return (
    <div className="space-y-4">
      <button
        onClick={() => setRevealed((r) => !r)}
        className="flex min-h-52 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm"
      >
        <span className="text-3xl font-semibold text-slate-900">{top}</span>
        {revealed ? (
          <span className="text-xl text-indigo-600">{bottom}</span>
        ) : (
          <span className="text-sm text-slate-400">tap to reveal</span>
        )}
        <span className="mt-1 text-xs uppercase tracking-wide text-slate-300">{word.pos}</span>
      </button>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => setRevealed((r) => !r)}>
          {revealed ? "Hide" : "Reveal"}
        </Button>
        <Button className="flex-1" onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
