"use client";
import { useEffect, useState } from "react";
import type { ProgressApi } from "@/components/useProgress";
import { Bar, Button, Card, Pill, cx } from "@/components/ui";
import { StoryBody } from "@/components/composition/controls";
import { Definable } from "@/components/composition/Definable";
import { PracticeRunner } from "@/components/course/PracticeRenderer";
import { LessonChat } from "@/components/course/LessonChat";
import { LessonVocab, LessonFlashcards } from "@/components/course/LessonVocab";
import { Play } from "@/components/Play";
import { Writing } from "@/components/composition/Writing";
import { Reading } from "@/components/composition/Reading";
import { Listening } from "@/components/composition/Listening";
import { getLesson, lessonPlayPool, resolveLessonWords } from "@/lib/curriculum";
import { isReview } from "@/lib/progress";
import { lessonGate } from "@/lib/lesson-progress";
import type { ExplanationRow, Lesson, PracticeKind } from "@/lib/course";

type GateActivity =
  | { kind: "writing" | "reading" | "listening" | "flashcards" }
  | { kind: "vocab"; exercise: "spelling" | "conjugation" };

// In-page panels (gate panel stays visible above them).
type Panel = "menu" | "vocab" | "explain" | "chat" | "practice";

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
  const [panel, setPanel] = useState<Panel>("menu");
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
  const isGrammar = lesson.kind === "grammar";

  // A full-screen gate activity (composition / vocab Play) takes over until exit.
  if (activity)
    return <GateActivity lesson={lesson} activity={activity} api={api} onExit={() => setActivity(null)} />;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
      {panel === "menu" && (
        <button onClick={onExit} className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Course
        </button>
      )}
      <div className="mb-1 flex items-center gap-2">
        <Pill tone="indigo">{isGrammar ? "Grammar" : "Vocabulary"}</Pill>
      </div>
      <h1 className="mb-4 text-xl font-bold text-slate-900">{lesson.title}</h1>

      {panel === "menu" ? (
        <>
          {/* gate lives only on the lesson menu */}
          <GatePanel lesson={lesson} api={api} />
          <LessonMenu lesson={lesson} onPanel={setPanel} onLaunch={setActivity} />
        </>
      ) : (
        <div className="mt-4">
          <button
            onClick={() => setPanel("menu")}
            className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            ← Lesson menu
          </button>
          {panel === "vocab" && <LessonVocab lessonId={lessonId} api={api} />}
          {panel === "explain" && <LessonExplanation lessonId={lessonId} />}
          {panel === "chat" && (
            <LessonChat
              lessonId={lessonId}
              onStartPractice={(kind) => {
                setPracticeReq({ kind, nonce: Date.now() });
                setPanel("practice");
              }}
            />
          )}
          {panel === "practice" && (
            <PracticeRunner
              lessonId={lessonId}
              request={practiceReq}
              onComplete={isGrammar ? () => api.recordPractice(lessonId) : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Read-only gate progress bars (incl. the practice row for grammar lessons).
function GatePanel({ lesson, api }: { lesson: Lesson; api: ProgressApi }) {
  const g = lessonGate(api.state, lesson);
  const rows = [
    { label: "Vocabulary", done: g.vocab.done, total: g.vocab.total },
    { label: "Writing", done: g.writing.done, total: g.writing.target },
    { label: "Reading", done: g.reading.done, total: g.reading.target },
    { label: "Listening", done: g.listening.done, total: g.listening.target },
    ...(g.practice ? [{ label: "Practice drills", done: g.practice.done, total: g.practice.target }] : []),
  ];
  return (
    <Card className={cx("p-4", g.passed && "border-emerald-200")}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Lesson gate</span>
        {g.passed && <Pill tone="green">passed ✓</Pill>}
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{r.label}</span>
              <span className={cx("font-medium", r.done >= r.total ? "text-emerald-600" : "text-slate-500")}>
                {r.done}/{r.total}
              </span>
            </div>
            <Bar value={r.total ? r.done / r.total : 1} tone={r.done >= r.total ? "green" : "indigo"} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// The lesson hub: learn buttons + practice buttons under the gate.
function LessonMenu({
  lesson,
  onPanel,
  onLaunch,
}: {
  lesson: Lesson;
  onPanel: (p: Panel) => void;
  onLaunch: (a: GateActivity) => void;
}) {
  const words = resolveLessonWords(lesson);
  const hasVerbs = words.some((w) => w.pos === "verb");
  const hasOther = words.some((w) => w.pos !== "verb");
  const isGrammar = lesson.kind === "grammar";

  const Item = ({ emoji, label, blurb, onClick }: { emoji: string; label: string; blurb: string; onClick: () => void }) => (
    <button onClick={onClick} className="w-full text-left">
      <Card className="flex items-center gap-3 p-3 hover:border-indigo-300">
        <span className="text-2xl">{emoji}</span>
        <span className="flex-1">
          <span className="block font-semibold text-slate-900">{label}</span>
          <span className="block text-xs text-slate-500">{blurb}</span>
        </span>
      </Card>
    </button>
  );

  return (
    <div className="mt-4 space-y-4">
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Learn</h2>
        <Item emoji="📋" label="Vocabulary" blurb="The words to learn, with examples & flashcards." onClick={() => onPanel("vocab")} />
        <Item emoji="📖" label="Explanation" blurb="Your AI teacher explains the lesson." onClick={() => onPanel("explain")} />
        <Item emoji="💬" label="Chat" blurb="Ask questions about this lesson." onClick={() => onPanel("chat")} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Practice</h2>
        <Item emoji="🎴" label="Flashcards" blurb="Flip through the words with examples." onClick={() => onLaunch({ kind: "flashcards" })} />
        {hasOther && (
          <Item emoji="✍️" label="Spelling" blurb="Master the non-verb words." onClick={() => onLaunch({ kind: "vocab", exercise: "spelling" })} />
        )}
        {hasVerbs && (
          <Item emoji="🔤" label="Conjugation" blurb="Master the verbs." onClick={() => onLaunch({ kind: "vocab", exercise: "conjugation" })} />
        )}
        {isGrammar && (
          <Item emoji="🎯" label="Practice drills" blurb="Generated drills — 5 to pass this lesson." onClick={() => onPanel("practice")} />
        )}
        <Item emoji="📝" label="Writing" blurb="Write to the gate (5 needed)." onClick={() => onLaunch({ kind: "writing" })} />
        <Item emoji="📚" label="Reading" blurb="Read a story + quiz (5 needed)." onClick={() => onLaunch({ kind: "reading" })} />
        <Item emoji="🎧" label="Listening" blurb="Listen + quiz (5 needed)." onClick={() => onLaunch({ kind: "listening" })} />
      </section>
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
          <Definable>
            <StoryBody body={row.body} />
          </Definable>
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
  const lessonWords = resolveLessonWords(lesson).map((w) => w.spanish);
  if (activity.kind !== "vocab") {
    if (activity.kind === "flashcards") return <LessonFlashcards lessonId={lesson.id} onExit={onExit} />;
    if (activity.kind === "writing")
      return (
        <Writing
          onExit={onExit}
          onPassed={() => api.bumpLesson(lesson.id, "writing")}
          initialCriteria={crit}
          includeWords={lessonWords}
        />
      );
    if (activity.kind === "reading")
      return (
        <Reading
          onExit={onExit}
          onPassed={() => api.bumpLesson(lesson.id, "reading")}
          initialCriteria={crit}
          includeWords={lessonWords}
          lessonId={lesson.id}
        />
      );
    return <Listening onExit={onExit} onPassed={() => api.bumpLesson(lesson.id, "listening")} />;
  }
  const exercise = activity.exercise;
  const poolIds = lessonPlayPool(lesson, exercise).map((w) => w.id);
  return (
    <Play
      mode="learn"
      exercise={exercise}
      settings={api.state.settings}
      tracking
      state={api.state}
      // Grind only the not-yet-mastered words (sticky once the 3-in-a-row is hit).
      buildRound={() => lessonPlayPool(lesson, exercise).filter((w) => !isReview(api.state, w.id))}
      record={(id, ex, correct) => api.recordInLesson(id, ex, correct, lesson.id)}
      demote={api.demote}
      onExit={onExit}
      onOverride={() => {
        api.overrideMastery(poolIds, exercise, lesson.id);
        onExit();
      }}
      title={`${lesson.title} · ${exercise}`}
    />
  );
}
