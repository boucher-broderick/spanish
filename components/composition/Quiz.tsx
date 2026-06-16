"use client";
import { useRef, useState } from "react";
import { AnswerGrade, QuizQuestion } from "@/lib/composition";
import { QUIZ_PASS_FRACTION } from "@/lib/course";
import { Button, Card, Pill } from "../ui";

// Open-ended comprehension quiz shared by Reading and Listening. Answers can be
// self-checked against the model answer or graded by Gemini. `onPassed` (used by
// the course gate) fires at most once, when a graded attempt clears the pass bar.
export function Quiz({
  storyId,
  quiz,
  level,
  onPassed,
}: {
  storyId: string;
  quiz: QuizQuestion[];
  level: string;
  onPassed?: () => void;
}) {
  const [answers, setAnswers] = useState<string[]>(() => quiz.map(() => ""));
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<AnswerGrade[] | null>(null);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState("");
  const passedRef = useRef(false);

  if (quiz.length === 0) return <p className="text-sm text-slate-400">No quiz questions for this story.</p>;

  function reveal(i: number) {
    setRevealed((s) => new Set(s).add(i));
  }

  async function grade() {
    setGrading(true);
    setError("");
    try {
      const res = await fetch("/api/stories/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId, answers, level }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to grade");
      const graded = (d.results ?? []) as AnswerGrade[];
      setResults(graded);
      const correct = graded.filter((r) => r.correct).length;
      if (!passedRef.current && quiz.length > 0 && correct / quiz.length >= QUIZ_PASS_FRACTION) {
        passedRef.current = true;
        onPassed?.();
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setGrading(false);
    }
  }

  const score = results ? results.filter((r) => r.correct).length : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Comprehension</h3>
        {score !== null && (
          <Pill tone={score === quiz.length ? "green" : "amber"}>
            {score} / {quiz.length}
          </Pill>
        )}
      </div>

      {quiz.map((q, i) => {
        const r = results?.find((x) => x.index === i);
        return (
          <Card key={i} className="space-y-2 p-3">
            <p className="font-medium text-slate-800">
              {i + 1}. {q.question}
            </p>
            <textarea
              value={answers[i]}
              onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
              rows={2}
              placeholder="Tu respuesta…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {r && (
              <div className="flex items-start gap-2 text-sm">
                <Pill tone={r.correct ? "green" : "amber"}>{r.correct ? "✓" : "✗"}</Pill>
                <span className="text-slate-500">{r.feedback}</span>
              </div>
            )}
            {revealed.has(i) ? (
              <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
                <span className="font-semibold">Modelo:</span> {q.reference_answer}
              </p>
            ) : (
              <button onClick={() => reveal(i)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                Reveal model answer
              </button>
            )}
          </Card>
        );
      })}

      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button className="w-full" onClick={grade} disabled={grading}>
        {grading ? "Grading…" : results ? "Re-grade my answers" : "Grade my answers"}
      </Button>
    </div>
  );
}
