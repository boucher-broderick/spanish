"use client";
import { NumbersStep, Settings } from "@/lib/domain";
import { numberToSpanish } from "@/lib/spanish/numbers";
import { AnswerFooter, AnswerInput, PromptHeader } from "../exercises/shared";
import { GameShell, Question, useTypedGame } from "./GameShell";

const MAX = 1_000_000_000;
const STEPS: NumbersStep[] = [1, 10, 100, 1000];

// Pick a random value in [min, max] aligned to `step`.
function pick(min: number, max: number, step: number): number {
  const lo = Math.ceil(min / step) * step;
  const hi = Math.floor(max / step) * step;
  if (hi < lo) return Math.max(0, Math.min(min, MAX));
  const count = Math.floor((hi - lo) / step) + 1;
  return lo + step * Math.floor(Math.random() * count);
}

export function NumbersGame({
  settings,
  updateSettings,
  onExit,
}: {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  onExit: () => void;
}) {
  const { numbersMin: min, numbersMax: max, numbersStep: step } = settings;

  const gen = (): Question => {
    const n = pick(min, max, step);
    return {
      prompt: <span className="text-4xl font-bold tracking-tight text-slate-900">{n.toLocaleString("en-US")}</span>,
      accepted: [numberToSpanish(n)],
      canonical: numberToSpanish(n),
    };
  };
  const game = useTypedGame(gen, `${min}-${max}-${step}`);

  const setBound = (key: "numbersMin" | "numbersMax", raw: string) => {
    const v = Math.max(0, Math.min(MAX, Math.floor(Number(raw) || 0)));
    updateSettings({ [key]: v });
  };

  const controls = (
    <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-sm">
        <label className="text-slate-500">From</label>
        <input
          type="number"
          value={min}
          min={0}
          max={MAX}
          onChange={(e) => setBound("numbersMin", e.target.value)}
          className="w-32 rounded-lg border border-slate-300 px-2 py-1.5"
        />
        <label className="text-slate-500">to</label>
        <input
          type="number"
          value={max}
          min={0}
          max={MAX}
          onChange={(e) => setBound("numbersMax", e.target.value)}
          className="w-36 rounded-lg border border-slate-300 px-2 py-1.5"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">Step</span>
        {STEPS.map((s) => (
          <button
            key={s}
            onClick={() => updateSettings({ numbersStep: s })}
            className={
              "rounded-lg border px-3 py-1.5 text-sm " +
              (step === s
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-300 bg-white text-slate-600")
            }
          >
            {s.toLocaleString("en-US")}s
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <GameShell title="Numbers" onExit={onExit} score={game.score} controls={controls}>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <PromptHeader eyebrow="Numbers">
          <span className="text-sm text-slate-400">spell this number in Spanish</span>
        </PromptHeader>
        <div className="mb-4 text-center">{game.q.prompt}</div>
        <AnswerInput
          ref={game.inputRef}
          value={game.value}
          readOnly={game.phase === "feedback"}
          onChange={(e) => game.setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && game.onEnter()}
          placeholder="español…"
        />
        <div className="mt-4">
          <AnswerFooter
            phase={game.phase}
            correct={game.correct}
            submitDisabled={!game.value.trim()}
            reveal={!game.correct && <>Correct: <b className="text-slate-900">{game.q.canonical}</b></>}
            note={game.accentMiss && "Accents count — that was the only difference."}
            onSubmit={game.submit}
            onNext={game.next}
          />
        </div>
      </div>
    </GameShell>
  );
}
