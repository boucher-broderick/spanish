"use client";
import { useEffect, useState } from "react";
import type { ProgressApi } from "@/components/useProgress";
import { Bar, Button, Card, Pill, cx } from "@/components/ui";
import { StoryBody } from "@/components/composition/controls";
import { PracticeRunner } from "@/components/course/PracticeRenderer";
import { LessonChat } from "@/components/course/LessonChat";
import { Play } from "@/components/Play";
import { Writing } from "@/components/composition/Writing";
import { Reading } from "@/components/composition/Reading";
import { Listening } from "@/components/composition/Listening";
import { getLesson, lessonPlayPool, resolveLessonWords } from "@/lib/curriculum";
import { lessonGate } from "@/lib/lesson-progress";
import type { ExplanationRow, Lesson, PracticeKind } from "@/lib/course";

type GateActivity =
  | { kind: "writing" | "reading" | "listening" }
  | { kind: "vocab"; exercise: "spelling" | "conjugation" };

type Tab = "explain" | "chat" | "practice" | "gate";
const TABS: { id: Tab; label: string }[] = [
  { id: "explain", label: "Explanation" },
  { id: "chat", label: "Chat" },
  { id: "practice", label: "Practice" },
  { id: "gate", label: "Gate" },
];

export function LessonView({
  lessonId,
  api,
  onExit,
}: {
  lessonId: string;
  api: ProgressApi;
  onExit: () => void;
}) {
  const lesson = getLesson(lessonId);
  const [tab, setTab] = useState<Tab>("explain");
  const [practiceReq, setPracticeReq] = useState<{ kind: PracticeKind; nonce: number } | null>(null);
  const [activity, setActivity] = useState<GateActivity | null>(null);
  if (!lesson) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        <button onClick={onExit} className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Back
        </button>
        <p className="text-sm text-slate-500">Lesson not found.</p>
      </div>
    );
  }

  // A gate activity takes over the whole screen until the user exits back to the gate.
  if (activity)
    return <GateActivity lesson={lesson} activity={activity} api={api} onExit={() => setActivity(null)} />;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      <button onClick={onExit} className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800">
        ← Course
      </button>
      <div className="mb-1 flex items-center gap-2">
        <Pill tone="indigo">{lesson.kind === "vocab" ? "Vocabulary" : "Grammar"}</Pill>
      </div>
      <h1 className="mb-4 text-xl font-bold text-slate-900">{lesson.title}</h1>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "rounded-lg px-3 py-1 text-sm font-medium transition-colors",
              tab === t.id ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "explain" && <LessonExplanation lessonId={lessonId} />}
      {tab === "chat" && (
        <LessonChat
          lessonId={lessonId}
          onStartPractice={(kind) => {
            setPracticeReq({ kind, nonce: Date.now() });
            setTab("practice");
          }}
        />
      )}
      {tab === "practice" && <PracticeRunner lessonId={lessonId} request={practiceReq} />}
      {tab === "gate" && <LessonGate lesson={lesson} api={api} onLaunch={setActivity} />}
    </div>
  );
}

function LessonExplanation({ lessonId }: { lessonId: string }) {
  const [row, setRow] = useState<ExplanationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetch(`/api/course/lessons/${lessonId}/explanation`)
      .then(async (r) => ({ ok: r.ok, d: await r.json() }))
      .then(({ ok, d }) => {
        if (!alive) return;
        if (!ok) setError(d.error ?? "Could not load the explanation.");
        else setRow(d.explanation);
      })
      .catch(() => alive && setError("Could not load the explanation."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [lessonId]);

  async function regenerate() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/course/lessons/${lessonId}/explanation`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to regenerate");
      setRow(d.explanation);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Writing your lesson…</p>;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {row && (
        <Card className="p-4">
          <StoryBody body={row.body} />
        </Card>
      )}
      {row && (
        <div className="text-right">
          <Button variant="ghost" onClick={regenerate} disabled={busy}>
            {busy ? "Rewriting…" : "↻ Regenerate"}
          </Button>
        </div>
      )}
    </div>
  );
}

function LessonGate({
  lesson,
  api,
  onLaunch,
}: {
  lesson: Lesson;
  api: ProgressApi;
  onLaunch: (a: GateActivity) => void;
}) {
  const g = lessonGate(api.state, lesson);
  const words = resolveLessonWords(lesson);
  const hasVerbs = words.some((w) => w.pos === "verb");
  const hasOther = words.some((w) => w.pos !== "verb");

  const rows: { label: string; done: number; total: number; launch?: GateActivity }[] = [
    { label: "Writing prompts", done: g.writing.done, total: g.writing.target, launch: { kind: "writing" } },
    { label: "Reading prompts", done: g.reading.done, total: g.reading.target, launch: { kind: "reading" } },
    { label: "Listening prompts", done: g.listening.done, total: g.listening.target, launch: { kind: "listening" } },
    { label: "Vocabulary mastered", done: g.vocab.done, total: g.vocab.total },
  ];

  return (
    <div className="space-y-3">
      {g.passed && (
        <Card className="border-emerald-200 p-3">
          <span className="font-semibold text-emerald-700">Lesson passed ✓</span>
        </Card>
      )}
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-slate-700">{r.label}</span>
            <span className={cx("font-medium", r.done >= r.total ? "text-emerald-600" : "text-slate-500")}>
              {r.done}/{r.total}
            </span>
          </div>
          <Bar value={r.total ? r.done / r.total : 1} tone={r.done >= r.total ? "green" : "indigo"} />
          {r.launch && r.done < r.total && (
            <button
              onClick={() => onLaunch(r.launch!)}
              className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Do one →
            </button>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        {hasOther && (
          <Button variant="secondary" onClick={() => onLaunch({ kind: "vocab", exercise: "spelling" })}>
            Practice spelling
          </Button>
        )}
        {hasVerbs && (
          <Button variant="secondary" onClick={() => onLaunch({ kind: "vocab", exercise: "conjugation" })}>
            Practice conjugation
          </Button>
        )}
      </div>
      <p className="pt-1 text-xs text-slate-400">
        Practice in the Practice tab is formative — these four bars are what unlock the lesson.
      </p>
    </div>
  );
}

// Full-screen gate activity: a lesson-scoped composition task or a vocab Play
// session. Each reuses the existing component and reports completion via the
// course callbacks on `api`.
function GateActivity({
  lesson,
  activity,
  api,
  onExit,
}: {
  lesson: Lesson;
  activity: GateActivity;
  api: ProgressApi;
  onExit: () => void;
}) {
  const crit = { level: "A2" as const, topic: lesson.grammarTopic ?? lesson.title };
  if (activity.kind !== "vocab") {
    if (activity.kind === "writing")
      return <Writing onExit={onExit} onPassed={() => api.bumpLesson(lesson.id, "writing")} initialCriteria={crit} />;
    if (activity.kind === "reading")
      return <Reading onExit={onExit} onPassed={() => api.bumpLesson(lesson.id, "reading")} initialCriteria={crit} />;
    return <Listening onExit={onExit} onPassed={() => api.bumpLesson(lesson.id, "listening")} />;
  }
  const exercise = activity.exercise;
  return (
    <Play
      mode="learn"
      exercise={exercise}
      settings={api.state.settings}
      tracking
      state={api.state}
      buildRound={() => lessonPlayPool(lesson, exercise)}
      record={(id, ex, correct) => api.recordInLesson(id, ex, correct, lesson.id)}
      demote={api.demote}
      onExit={onExit}
      title={`${lesson.title} · vocab`}
    />
  );
}
