"use client";
import { useState } from "react";
import type { ProgressApi } from "@/components/useProgress";
import { Bar, Button, Card, Pill } from "@/components/ui";
import { Play } from "@/components/Play";
import { Writing } from "@/components/composition/Writing";
import { Reading } from "@/components/composition/Reading";
import { Listening } from "@/components/composition/Listening";
import { localToday } from "@/lib/course";
import { dailyPlayPool, dailyStatus } from "@/lib/lesson-progress";

type Activity =
  | { kind: "writing" | "reading" | "listening" }
  | { kind: "vocab"; exercise: "spelling" | "conjugation" };

export function DailyReview({ api, onExit }: { api: ProgressApi; onExit: () => void }) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const today = localToday();
  const status = dailyStatus(api.state, today);

  if (activity) return <DailyActivity activity={activity} api={api} onExit={() => setActivity(null)} />;

  // Nothing completed yet -> no review due.
  if (status.wordsTotal === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        <button onClick={onExit} className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Back
        </button>
        <h1 className="mb-2 text-xl font-bold text-slate-900">🔁 Daily review</h1>
        <p className="text-sm text-slate-500">
          No review due yet — complete a lesson first and it&apos;ll show up here the next day.
        </p>
      </div>
    );
  }

  const hasSpelling = dailyPlayPool(api.state, "spelling").length > 0;
  const hasConjugation = dailyPlayPool(api.state, "conjugation").length > 0;

  const tasks: { label: string; done: boolean; launch: Activity }[] = [
    { label: "Write one prompt", done: status.writingDone, launch: { kind: "writing" } },
    { label: "Read one story", done: status.readingDone, launch: { kind: "reading" } },
    { label: "Listen to one story", done: status.listeningDone, launch: { kind: "listening" } },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      <button onClick={onExit} className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800">
        ← Back
      </button>
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-xl font-bold text-slate-900">🔁 Daily review</h1>
        {status.done ? <Pill tone="green">done ✓</Pill> : <Pill tone="amber">due</Pill>}
      </div>
      <p className="mb-4 text-sm text-slate-500">
        A quick daily pass over your last lessons. Finish it to unlock the next lesson.
      </p>

      <Card className="mb-4 p-4">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Vocabulary</span>
          <span className="text-slate-500">
            {status.wordsDone}/{status.wordsTotal}
          </span>
        </div>
        <Bar value={status.wordsTotal ? status.wordsDone / status.wordsTotal : 1} tone={status.wordsDone >= status.wordsTotal ? "green" : "indigo"} />
        <div className="mt-3 flex flex-wrap gap-2">
          {hasSpelling && (
            <Button variant="secondary" onClick={() => setActivity({ kind: "vocab", exercise: "spelling" })}>
              Spelling
            </Button>
          )}
          {hasConjugation && (
            <Button variant="secondary" onClick={() => setActivity({ kind: "vocab", exercise: "conjugation" })}>
              Conjugation
            </Button>
          )}
        </div>
      </Card>

      <div className="space-y-2">
        {tasks.map((t) => (
          <Card key={t.label} className="flex items-center justify-between p-3">
            <span className="flex items-center gap-2 text-sm text-slate-700">
              {t.done && <Pill tone="green">✓</Pill>}
              {t.label}
            </span>
            <Button variant={t.done ? "secondary" : "primary"} onClick={() => setActivity(t.launch)}>
              {t.done ? "Again" : "Do it"}
            </Button>
          </Card>
        ))}
      </div>

      {status.done && (
        <Card className="mt-4 border-emerald-200 p-3 text-center">
          <span className="font-semibold text-emerald-700">Daily review complete — you can advance.</span>
        </Card>
      )}
    </div>
  );
}

function DailyActivity({ activity, api, onExit }: { activity: Activity; api: ProgressApi; onExit: () => void }) {
  if (activity.kind !== "vocab") {
    if (activity.kind === "writing")
      return <Writing onExit={onExit} onPassed={() => api.bumpDaily("writing")} initialCriteria={{ level: "A2" }} />;
    if (activity.kind === "reading")
      return <Reading onExit={onExit} onPassed={() => api.bumpDaily("reading")} initialCriteria={{ level: "A2" }} />;
    return <Listening onExit={onExit} onPassed={() => api.bumpDaily("listening")} />;
  }
  const exercise = activity.exercise;
  return (
    <Play
      mode="learn"
      exercise={exercise}
      settings={api.state.settings}
      tracking
      state={api.state}
      buildRound={() => dailyPlayPool(api.state, exercise)}
      record={(id, ex, correct) => api.recordInDaily(id, ex, correct)}
      demote={api.demote}
      onExit={onExit}
      title={`Daily review · ${exercise}`}
    />
  );
}
