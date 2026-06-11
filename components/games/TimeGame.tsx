"use client";
import { Settings, TimeMode } from "@/lib/domain";
import { acceptedTimeAnswers, englishTimePhrase, timeCanonical } from "@/lib/spanish/time";
import { AnswerFooter, AnswerInput, PromptHeader } from "../exercises/shared";
import { GameShell, Question, useTypedGame } from "./GameShell";

function randomTime(): { hour: number; minute: number } {
  return { hour: 1 + Math.floor(Math.random() * 12), minute: Math.floor(Math.random() * 60) };
}

export function TimeGame({
  settings,
  updateSettings,
  onExit,
}: {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  onExit: () => void;
}) {
  const mode = settings.timeMode;

  const gen = (): Question => {
    const t = randomTime();
    const canonical = timeCanonical(t);
    if (mode === "english") {
      return {
        prompt: <span className="text-3xl font-bold text-slate-900">{englishTimePhrase(t)}</span>,
        accepted: [canonical],
        canonical,
      };
    }
    return {
      prompt: (
        <span className="text-5xl font-bold tabular-nums text-slate-900">
          {t.hour}:{String(t.minute).padStart(2, "0")}
        </span>
      ),
      accepted: acceptedTimeAnswers(t),
      canonical,
    };
  };
  const game = useTypedGame(gen, mode);

  const controls = (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <span className="text-sm text-slate-500">Show as</span>
      {(["number", "english"] as TimeMode[]).map((m) => (
        <button
          key={m}
          onClick={() => updateSettings({ timeMode: m })}
          className={
            "rounded-lg border px-3 py-1.5 text-sm " +
            (mode === m
              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
              : "border-slate-300 bg-white text-slate-600")
          }
        >
          {m === "number" ? "Clock (5:30)" : "English words"}
        </button>
      ))}
    </div>
  );

  return (
    <GameShell title="Time" onExit={onExit} score={game.score} controls={controls}>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <PromptHeader eyebrow="Time">
          <span className="text-sm text-slate-400">write the time in Spanish</span>
        </PromptHeader>
        <div className="mb-4 text-center">{game.q.prompt}</div>
        <AnswerInput
          ref={game.inputRef}
          value={game.value}
          readOnly={game.phase === "feedback"}
          onChange={(e) => game.setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && game.onEnter()}
          placeholder="son las…"
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
