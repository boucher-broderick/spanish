"use client";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import type { QuizQuestion } from "@/lib/composition";

// Open-ended comprehension quiz shared by Reading and Listening. Self-checked:
// the learner writes an answer, then reveals the model answer to compare. No
// LLM grading — keeps it instant and free.
export function StoryQuiz({ quiz }: { quiz: QuizQuestion[] }) {
  const [answers, setAnswers] = useState<string[]>(() => quiz.map(() => ""));
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  if (quiz.length === 0) return <p className="text-sm text-slate-400">No quiz questions for this story.</p>;

  return (
    <div className="space-y-3">
      {quiz.map((item, i) => (
        <Card key={i} className="p-3">
          <p className="font-medium text-slate-800">{i + 1}. {item.q}</p>
          <input
            value={answers[i]}
            onChange={(e) => setAnswers((a) => { const n = [...a]; n[i] = e.target.value; return n; })}
            placeholder="Tu respuesta…"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          {revealed.has(i) ? (
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <span className="font-semibold">Model answer:</span> {item.a}
            </p>
          ) : (
            <button
              onClick={() => setRevealed((s) => new Set(s).add(i))}
              className="mt-2 text-sm font-medium text-indigo-600 hover:underline"
            >
              Reveal answer
            </button>
          )}
        </Card>
      ))}
      {revealed.size < quiz.length && (
        <Button variant="secondary" onClick={() => setRevealed(new Set(quiz.map((_, i) => i)))}>
          Reveal all
        </Button>
      )}
    </div>
  );
}
