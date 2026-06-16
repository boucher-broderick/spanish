"use client";
import { useMemo } from "react";
import type { ProgressApi } from "@/components/useProgress";
import { Bar, Button, Card, Pill, cx } from "@/components/ui";
import { localToday, type Lesson } from "@/lib/course";
import { getUnits, orderedLessons } from "@/lib/curriculum";
import { canAdvance, dailyStatus, isLessonComplete, lessonGate } from "@/lib/lesson-progress";

type LessonStatus = "complete" | "inProgress" | "available" | "lockedDaily" | "lockedFuture";

// Combined gate progress as a 0-1 fraction across all four pillars.
function gateFraction(api: ProgressApi, lesson: Lesson): number {
  const g = lessonGate(api.state, lesson);
  const done = g.writing.done + g.reading.done + g.listening.done + g.vocab.done;
  const total = g.writing.target + g.reading.target + g.listening.target + g.vocab.total;
  return total ? done / total : 0;
}

export function CourseHome({
  api,
  onOpenLesson,
  onOpenDaily,
  onExit,
}: {
  api: ProgressApi;
  onOpenLesson: (id: string) => void;
  onOpenDaily: () => void;
  onExit: () => void;
}) {
  const { state } = api;
  const today = localToday();
  const daily = dailyStatus(state, today);
  const advance = canAdvance(state, today);

  // Status per lesson: linear progression with a single "frontier" (next) lesson.
  const statuses = useMemo(() => {
    const out: Record<string, LessonStatus> = {};
    let frontierTaken = false;
    for (const l of orderedLessons()) {
      if (isLessonComplete(state, l.id)) {
        out[l.id] = "complete";
        continue;
      }
      const g = lessonGate(state, l);
      const started = g.writing.done || g.reading.done || g.listening.done || g.vocab.done;
      if (started) {
        out[l.id] = "inProgress";
      } else if (!frontierTaken) {
        frontierTaken = true;
        out[l.id] = advance ? "available" : "lockedDaily";
      } else {
        out[l.id] = "lockedFuture";
      }
    }
    return out;
  }, [state, advance]);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      <button onClick={onExit} className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800">
        ← Back
      </button>
      <h1 className="mb-1 text-xl font-bold text-slate-900">📚 Course</h1>
      <p className="mb-4 text-sm text-slate-500">A guided path from A1 into A2 — grammar, vocabulary, and your AI teacher.</p>

      {/* Daily review banner */}
      {daily.wordsTotal > 0 && (
        <Card className={cx("mb-5 p-4", daily.done ? "border-emerald-200" : "border-amber-300")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">Daily review</span>
                {daily.done ? <Pill tone="green">done ✓</Pill> : <Pill tone="amber">due today</Pill>}
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {daily.wordsDone}/{daily.wordsTotal} words ·{" "}
                {[daily.writingDone, daily.readingDone, daily.listeningDone].filter(Boolean).length}/3 tasks
                {!daily.done && " · finish to unlock the next lesson"}
              </p>
            </div>
            <Button variant={daily.done ? "secondary" : "primary"} onClick={onOpenDaily}>
              {daily.done ? "Review again" : "Start"}
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-6">
        {getUnits().map((unit) => (
          <section key={unit.id}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Unit {unit.order} · {unit.title}
            </h2>
            <p className="mb-2 text-xs text-slate-400">{unit.blurb}</p>
            <div className="space-y-2">
              {unit.lessonIds.map((lid) => {
                const lesson = orderedLessons().find((l) => l.id === lid);
                if (!lesson) return null;
                const status = statuses[lid];
                const locked = status === "lockedDaily" || status === "lockedFuture";
                const onClick = () => {
                  if (status === "lockedDaily") onOpenDaily();
                  else if (status !== "lockedFuture") onOpenLesson(lid);
                };
                return (
                  <Card
                    key={lid}
                    className={cx("p-3", status === "lockedFuture" && "opacity-60")}
                  >
                    <button
                      className="block w-full text-left disabled:cursor-not-allowed"
                      disabled={status === "lockedFuture"}
                      onClick={onClick}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 font-semibold text-slate-800">
                          <span>{lesson.kind === "vocab" ? "📖" : "✏️"}</span>
                          {lesson.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {status === "complete" && <Pill tone="green">passed ✓</Pill>}
                          {status === "inProgress" && <Pill tone="indigo">in progress</Pill>}
                          {status === "available" && <Pill tone="amber">start</Pill>}
                          {locked && <Pill>🔒</Pill>}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{lesson.summary}</p>
                      {(status === "inProgress" || status === "complete") && (
                        <div className="mt-2">
                          <Bar value={gateFraction(api, lesson)} tone={status === "complete" ? "green" : "indigo"} />
                        </div>
                      )}
                      {status === "lockedDaily" && (
                        <p className="mt-1 text-xs text-amber-600">Finish today&apos;s review first.</p>
                      )}
                    </button>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
