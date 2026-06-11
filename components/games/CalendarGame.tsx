"use client";
import { dateToEnglish, dateToSpanish } from "@/lib/spanish/dates";
import { AnswerFooter, AnswerInput, PromptHeader } from "../exercises/shared";
import { GameShell, Question, useTypedGame } from "./GameShell";

// A random calendar date. Day 1–28 of any month keeps every generated date valid
// while still exercising the full range of day numbers across months.
function randomDate(): Date {
  const year = 2024 + Math.floor(Math.random() * 4);
  const month = Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  return new Date(year, month, day);
}

export function CalendarGame({ onExit }: { onExit: () => void }) {
  const gen = (): Question => {
    const d = randomDate();
    const canonical = dateToSpanish(d); // "martes, nueve de junio"
    return {
      prompt: <span className="text-3xl font-bold text-slate-900">{dateToEnglish(d)}</span>,
      // Commas are optional when matching.
      accepted: [canonical, canonical.replace(/,/g, "")],
      canonical,
    };
  };
  const game = useTypedGame(gen);

  return (
    <GameShell title="Calendar" onExit={onExit} score={game.score}>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <PromptHeader eyebrow="Calendar">
          <span className="text-sm text-slate-400">write this date in Spanish</span>
        </PromptHeader>
        <div className="mb-4 text-center">{game.q.prompt}</div>
        <AnswerInput
          ref={game.inputRef}
          value={game.value}
          readOnly={game.phase === "feedback"}
          onChange={(e) => game.setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && game.onEnter()}
          placeholder="martes, … de …"
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
