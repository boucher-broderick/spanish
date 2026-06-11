"use client";
import { useCallback, useState } from "react";
import { ExerciseId, Mode, ProgressState, Settings, Word } from "@/lib/domain";
import { exercisePassed, isReview } from "@/lib/progress";
import { sentenceFor } from "@/lib/words";
import { Button, Card, Pill } from "./ui";
import { AccentBar } from "./AccentBar";
import { Conjugation } from "./exercises/Conjugation";
import { FillWord } from "./exercises/FillWord";
import { FillSentence } from "./exercises/FillSentence";
import { Spelling } from "./exercises/Spelling";
import { Flashcards } from "./exercises/Flashcards";
import { WordBank } from "./exercises/WordBank";

type RoundResult = { word: Word; correct: boolean };

export function Play({
  mode,
  exercise,
  settings,
  tracking,
  state,
  buildRound,
  record,
  demote,
  onExit,
  title,
}: {
  mode: Mode;
  exercise: ExerciseId;
  settings: Settings;
  tracking: boolean;
  state: ProgressState;
  buildRound: () => Word[];
  record: (wordId: string, ex: ExerciseId, correct: boolean) => void;
  demote: (wordId: string) => void;
  onExit: () => void;
  title: string;
}) {
  // Play is mounted fresh for each session (mode/exercise are fixed for its lifetime),
  // so the first round is built lazily on mount; `start` rebuilds on replay.
  const [round, setRound] = useState<Word[]>(() => buildRound());
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [finished, setFinished] = useState(false);
  const [flashFront, setFlashFront] = useState<"es" | "en">("es");

  const start = useCallback(() => {
    setRound(buildRound());
    setIdx(0);
    setResults([]);
    setFinished(false);
  }, [buildRound]);

  const current = round[idx];

  const handleResult = useCallback(
    (word: Word, correct: boolean) => {
      if (mode === "review") {
        // Known words: a correct answer keeps the word in review; a wrong answer
        // demotes it (review removed + main-game stats reset) so it returns to Learn.
        if (correct) record(word.id, exercise, true);
        else demote(word.id);
      } else if (tracking) {
        record(word.id, exercise, correct);
      }
      setResults((r) => [...r, { word, correct }]);
      setIdx((i) => {
        const nextI = i + 1;
        if (nextI >= round.length) {
          setFinished(true);
          return i;
        }
        return nextI;
      });
    },
    [tracking, record, demote, exercise, round.length, mode]
  );

  const advanceNoScore = useCallback(() => {
    setIdx((i) => {
      const nextI = i + 1;
      if (nextI >= round.length) {
        setFinished(true);
        return i;
      }
      return nextI;
    });
  }, [round.length]);

  // ---- empty pool ----
  if (round.length === 0) {
    return (
      <Shell title={title} onExit={onExit}>
        <Card className="p-6 text-center text-slate-600">
          <p className="text-lg font-semibold text-slate-800">Nothing to practice here</p>
          <p className="mt-2 text-sm">
            {mode === "review"
              ? "No words have reached review yet. Master words in Learn mode first."
              : "No eligible words — they may all be mastered, in review, or missing example sentences for this exercise."}
          </p>
          <Button className="mt-4" onClick={onExit}>
            Back
          </Button>
        </Card>
      </Shell>
    );
  }

  // ---- word bank (multi-word) ----
  if (exercise === "wordBank") {
    return (
      <Shell title={title} onExit={onExit}>
        {finished ? (
          <RoundSummary
            results={results}
            exercise={exercise}
            state={state}
            tracking={tracking}
            onReplay={start}
            onExit={onExit}
          />
        ) : (
          <Card className="p-4">
            <WordBank
              words={round}
              tenses={settings.tenses}
              tracking={tracking}
              onComplete={(graded) => {
                if (tracking) graded.forEach((g) => record(g.wordId, "wordBank", g.correct));
                setResults(
                  graded
                    .map((g) => ({ word: round.find((w) => w.id === g.wordId)!, correct: g.correct }))
                    .filter((r) => r.word)
                );
                setFinished(true);
              }}
            />
          </Card>
        )}
        <AccentBar />
      </Shell>
    );
  }

  // ---- flashcards (no scoring) ----
  if (exercise === "flashcards") {
    return (
      <Shell title={title} onExit={onExit} right={<Counter idx={idx} total={round.length} mode={mode} />}>
        <div className="mb-3 flex justify-center gap-2">
          <Button variant={flashFront === "es" ? "primary" : "ghost"} onClick={() => setFlashFront("es")}>
            ES → EN
          </Button>
          <Button variant={flashFront === "en" ? "primary" : "ghost"} onClick={() => setFlashFront("en")}>
            EN → ES
          </Button>
        </div>
        {finished ? (
          <Card className="p-6 text-center">
            <p className="text-lg font-semibold text-slate-800">Deck complete</p>
            <div className="mt-4 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={start}>
                Again
              </Button>
              <Button className="flex-1" onClick={onExit}>
                Back
              </Button>
            </div>
          </Card>
        ) : (
          <Flashcards key={current.id} word={current} front={flashFront} onNext={advanceNoScore} />
        )}
      </Shell>
    );
  }

  // ---- typed single-word exercises ----
  if (finished) {
    return (
      <Shell title={title} onExit={onExit}>
        <RoundSummary
          results={results}
          exercise={exercise}
          state={state}
          tracking={tracking}
          onReplay={start}
          onExit={onExit}
        />
      </Shell>
    );
  }

  const sentence = sentenceFor(current.id);
  return (
    <Shell
      title={title}
      onExit={onExit}
      right={<Counter idx={idx} total={round.length} mode={mode} score={results} />}
    >
      <Card className="p-4 sm:p-6">
        {exercise === "conjugation" && (
          <Conjugation key={current.id} word={current} tenses={settings.tenses} onResult={(c) => handleResult(current, c)} />
        )}
        {exercise === "fillWord" && (
          <FillWord key={current.id} word={current} sentence={sentence} onResult={(c) => handleResult(current, c)} />
        )}
        {exercise === "fillSentence" && sentence && (
          <FillSentence key={current.id} word={current} sentence={sentence} onResult={(c) => handleResult(current, c)} />
        )}
        {exercise === "spelling" && <Spelling key={current.id} word={current} onResult={(c) => handleResult(current, c)} />}
      </Card>
      <AccentBar />
    </Shell>
  );
}

function Shell({
  title,
  onExit,
  right,
  children,
}: {
  title: string;
  onExit: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button onClick={onExit} className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Exit
        </button>
        <div className="truncate text-sm font-semibold text-slate-700">{title}</div>
        <div className="min-w-16 text-right">{right}</div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-3 py-4">{children}</main>
    </div>
  );
}

function Counter({
  idx,
  total,
  mode,
  score,
}: {
  idx: number;
  total: number;
  mode: Mode;
  score?: RoundResult[];
}) {
  if (mode === "review") {
    const correct = score?.filter((s) => s.correct).length ?? 0;
    const done = score?.length ?? 0;
    return <span className="text-xs font-semibold text-slate-500">{correct}/{done}</span>;
  }
  return (
    <span className="text-xs font-semibold text-slate-500">
      {Math.min(idx + 1, total)}/{total}
    </span>
  );
}

function RoundSummary({
  results,
  exercise,
  state,
  tracking,
  onReplay,
  onExit,
}: {
  results: RoundResult[];
  exercise: ExerciseId;
  state: ProgressState;
  tracking: boolean;
  onReplay: () => void;
  onExit: () => void;
}) {
  const correct = results.filter((r) => r.correct).length;
  const pct = results.length ? Math.round((correct / results.length) * 100) : 0;
  // unique words this round
  const seen = new Map<string, Word>();
  results.forEach((r) => seen.set(r.word.id, r.word));

  return (
    <div className="space-y-4">
      <Card className="p-6 text-center">
        <div className="text-4xl font-bold text-slate-900">{pct}%</div>
        <div className="mt-1 text-sm text-slate-500">
          {correct} / {results.length} correct this round
        </div>
      </Card>
      {tracking && (
        <div className="space-y-2">
          {[...seen.values()].map((w) => {
            const passed = exercisePassed(state, w.id, exercise);
            const review = isReview(state, w.id);
            return (
              <div key={w.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="text-sm text-slate-700">
                  <b>{w.spanish}</b> · {w.english}
                </span>
                <span className="flex gap-1.5">
                  {review && <Pill tone="green">review ✓</Pill>}
                  {!review && passed && <Pill tone="indigo">10/80 ✓</Pill>}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onReplay}>
          Play again
        </Button>
        <Button className="flex-1" onClick={onExit}>
          Back
        </Button>
      </div>
    </div>
  );
}
