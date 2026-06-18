"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card, Pill } from "@/components/ui";
import { grade } from "@/lib/grade";
import { GAMES, type Question } from "@/lib/practice";
import { useTts } from "@/lib/useTts";

const ACCENTS = ["á", "é", "í", "ó", "ú", "ñ", "¿", "¡"];

export function PracticeQuiz({ gameKey }: { gameKey: string }) {
  const game = GAMES[gameKey];
  const gen = game.gen!; // drills always have gen
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState<Question>(() => gen());
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [listen, setListen] = useState(false);
  const { supported, speaking, loading, speak } = useTts();

  // In listen mode the prompt is hidden; the answer is spoken in Spanish and the
  // learner transcribes it. Grading is unchanged (still against q.answers).
  const sayPrompt = useCallback(() => { if (q.answers[0]) speak(q.answers[0]); }, [q, speak]);

  // Auto-play when a new question appears in listen mode.
  useEffect(() => {
    if (listen && supported) sayPrompt();
  }, [q, listen, supported, sayPrompt]);

  const verdict = useMemo(
    () => (checked ? grade(value, q.answers) : "empty"),
    [checked, value, q]
  );

  const next = () => {
    setQ(gen());
    setValue("");
    setChecked(false);
    inputRef.current?.focus();
  };

  const check = () => {
    if (checked || !value.trim()) return;
    const v = grade(value, q.answers);
    setScore((s) => ({ correct: s.correct + (v === "correct" ? 1 : 0), total: s.total + 1 }));
    setChecked(true);
  };

  const insertAccent = (ch: string) => {
    const el = inputRef.current;
    if (!el) { setValue((v) => v + ch); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const nextVal = value.slice(0, start) + ch + value.slice(end);
    setValue(nextVal);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  const pct = score.total ? Math.round((score.correct / score.total) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/practice"><Button variant="ghost">← Practice</Button></Link>
          <h1 className="text-lg font-bold text-slate-900">{game.emoji} {game.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {game.listen && (
            <button
              onClick={() => setListen((l) => !l)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
              title={listen ? "Switch to reading the prompt" : "Switch to hearing the prompt"}
            >
              {listen ? "👁 See" : "🔊 Listen"}
            </button>
          )}
          <Pill tone={pct >= 80 && score.total >= 5 ? "green" : "indigo"}>
            {score.correct}/{score.total}
          </Pill>
        </div>
      </div>

      <Card className="p-6">
        {listen ? (
          <div>
            <p className="text-sm text-slate-500">Listen and write what you hear in Spanish:</p>
            <button
              onClick={sayPrompt}
              disabled={!supported || loading}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-lg font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {loading ? "Generating…" : speaking ? "🔊 Playing…" : "🔊 Replay"}
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500">{game.instruction}</p>
            <p className={`mt-1 font-bold text-slate-900 ${q.promptKind === "number" ? "text-5xl tabular-nums" : "text-2xl"}`}>
              {q.prompt}
            </p>
          </>
        )}

        <input
          ref={inputRef}
          value={value}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          disabled={checked}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { if (checked) next(); else check(); }
          }}
          placeholder="escribe en español…"
          className={`mt-4 w-full rounded-xl border-2 px-3 py-2.5 text-lg outline-none ${
            verdict === "correct" ? "border-emerald-500 bg-emerald-50 text-emerald-800"
            : verdict === "incorrect" ? "border-rose-500 bg-rose-50 text-rose-800"
            : "border-slate-300 focus:border-indigo-500"
          }`}
        />

        <div className="mt-2 flex flex-wrap gap-1">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertAccent(a); }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm hover:bg-slate-100"
            >
              {a}
            </button>
          ))}
        </div>

        {checked && verdict === "incorrect" && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Answer: <span className="font-semibold">{q.answers[0]}</span>
          </p>
        )}
        {checked && verdict === "correct" && (
          <p className="mt-3 text-sm font-semibold text-emerald-600">¡Correcto! 🎉</p>
        )}

        <div className="mt-4 flex gap-2">
          {!checked ? (
            <Button onClick={check} disabled={!value.trim()}>Check</Button>
          ) : (
            <Button onClick={next}>Next →</Button>
          )}
        </div>
      </Card>

      <p className="mt-3 text-center text-xs text-slate-400">
        Press <kbd className="rounded bg-slate-100 px-1">Enter</kbd> to check, then again for the next one.
      </p>
    </div>
  );
}
